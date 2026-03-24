// Allow dark mode display:
onmessage = evt => {
    for (const [key, value] of Object.entries(evt.data)) {
        document.body.style[key] = value;
    }
}

// CONSTANTS
const TABLE_WIDTH = 1750;
const COLUMN_MIN_WIDTH = 250;
const DEFAULT_NUM_COLUMNS = 7; // 1750 / 250
const BASE_INDENT = 50; // px
const BASE_INDENT_OFFSET = 25;
const MIN_TABLE_HEADER_WIDTH = 125;
const FUNCTION_BAR_OFFSET = 40;
const HEADER_TEXT_WIDTH_RATIO = 4 / 5; // Ratio in relation to function bar width
const TOGGLE_ANIMATION_MS = 200;

function createTable(tableData) {
    createStaticTableElements();
    addTableData(tableData);

    const COLUMN_NAMES = getColumnNames();
    setupTableHeaders(COLUMN_NAMES);
    setupRowExpansion();
    setupRecordsDisplay();
    setupTableElementsAndSorting(COLUMN_NAMES);
    setupSortIconDisplay();
    setupDropdownMenus();
    setupFiltering();
    updateColumnWidth();
    setupColumnResizing();
    initializeColumnVisibilityDropdown(COLUMN_NAMES);
    addSelectAllColumnFilterEventListener();
    addColumnFilterCheckboxEventListener(COLUMN_NAMES);
    applyRowStyling();
    setupInitialFunctionBarPosition(); // it's probably best practice to do this last, in case of other modifications that affect the function bar position
    setupCopyDropdown()

}

/** This function adds the static, table html elements and functions as a sort of template where both data and further elements are inserted via JS.
 * It includes the column visibility elements (to hide/show columns), the record elements (to show the number of entries in the table), and the actual
 * table elements (aside from the actual data which is inserted later in the tbody).
 */
function createStaticTableElements() {
    const tableHtml = `
<div id="copyContainer" style="margin-bottom:10px; position:relative;">
  <button id="copyDropdownBtn" class="dropdownTrigger">⧉ Copy</button>

  <div id="copyDropdown" class="dropdown"
       style="display:none; position:absolute; background:#1d1d2e; padding:6px; border:1px solid #444; border-radius:4px; min-width: 200px;">
    <div class="copyOption" data-copy="text"          style="cursor:pointer; padding:4px;">📄 Copy as Text</div>
    <div class="copyOption" data-copy="csv"           style="cursor:pointer; padding:4px;">🧾 Copy as CSV</div>
    <div class="copyOption" data-copy="download csv"  style="cursor:pointer; padding:4px;">🧾 Download CSV</div>
    <hr style="border-color:#333; margin:6px 0;">
    <div class="copyOption" data-copy="html"          style="cursor:pointer; padding:4px;">📋 Copy as HTML</div>
    <div class="copyOption" data-copy="download html" style="cursor:pointer; padding:4px;">⬇️ Download HTML</div>
    <hr style="border-color:#333; margin:6px 0;">
    <div class="copyOption" data-copy="png-full"          style="cursor:pointer; padding:4px;">🖼️ Copy as PNG (Full table)</div>
    <div class="copyOption" data-copy="download png full" style="cursor:pointer; padding:4px;">⬇️ Download PNG (Full table)</div>
    <div class="copyOption" data-copy="download jpg full" style="cursor:pointer; padding:4px;">⬇️ Download JPG (Full table)</div>
  </div>
</div>
        <div>
            <div id="columnVisibilityWrapper" class="dropdownParent">
                <button id="columnVisibilityButton" class="dropdownTrigger">&#66022;&#66022;&#66022;</button>
                <div id="columnVisibilityDropdown" class="dropdown">
                    <span style="font-weight: bold;">Visible Columns:</span>
                    <div class="columnSelect">
                        <input type="checkbox" id="selectAllCheckbox" checked="true">
                        <label for="selectAllCheckbox">Select All</label>
                    </div>
                    <hr>
                </div>
            </div>

            <div id="recordWrapper">
                <span id="numRecords"></span>
                <span id="numRecordsText"></span>
            </div>
            <div id="tableWrapper">
                <table id="mainTable" cellspacing="0" cellpadding="0" class="tablesorter">
                    <thead>
                        <tr id="tableHeaderRow"></tr>
                    </thead>

                    <tbody id="tableBody">

                    </tbody>
                </table>
            </div>
            `
    document.body.innerHTML = tableHtml; // using innerHTML here is fine because no user input is used
}

/**
 * This function inserts the data in the table.
 * @param tableData - Sanitized HTML table data. The data is enclosed in a table, which has a tbody and tr elements (the data must lie in the tr tags).
 */
function addTableData(tableData) {
    try {
        let domParser = new DOMParser();
        let doc = domParser.parseFromString(tableData, "text/html");

        let tbody = doc.getElementsByTagName("tbody")[0];
        let rows = Array.from(tbody.children);

        for (let row of rows) {
            $('#tableBody').append(row);
        }
    } catch (e) {
        console.error("Custom Widget: function addTableData() could not load the data and failed with the following error message: \n", e);
    }
}

/**
 * This function takes a UTC ISO 8601 timestamp: YYYY-MM-DDThh:mm:ss.[sssss]Z and returns it like this: DD.MM.YYYY, hh:mm:ss.sss
 * If the input data/timestamp does not have the UTC ISO 8601 format, this function returns the unchanged parameter.
 */
function prettyTimestamp(timestamp) {
    const utcRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3,}Z$/;
    let isUtcFormat = utcRegex.test(timestamp);

    if (isUtcFormat) {
        let prettyUtc = "";
        let result = prettyUtc.concat(
            timestamp.substring(8, 10), '.',
            timestamp.substring(5, 7), '.',
            timestamp.substring(0, 4), ', ',
            timestamp.substring(11, 19), '.',
            timestamp.substring(20, 23)
        );

        return result;
    }

    return timestamp;
}

/** This function applies styling to specific table columns (specifically, columns that contain timestamp/severity data) and also setups the tablesorter.*/
function setupTableElementsAndSorting(columnNames) {
    let timestampColumnIndices = extractTimebasedColumns(columnNames);
    let severityColumnIndices = extractSeverityColumns(columnNames);

    postprocessHtmlElements(severityColumnIndices, timestampColumnIndices, columnNames.length);
    setupTablesorter(severityColumnIndices, timestampColumnIndices);
}

/**
 * This function applies (only) the alternating coloring to the table rows.
 * @param firstCall - This parameter is only true when this function is first called (i.e. when the table is rendered).
 * Because the user can apply row filters and, thus, hide certain rows, the row coloring has to be reapplied with the :visible attributes set.
*/
function applyRowColorStyling(firstCall) {
    let evenRows = firstCall ? $(".mainTr").filter(":even") : $(".mainTr").filter(":visible:even");
    let oddRows = firstCall ? $(".mainTr").filter(":odd") : $(".mainTr").filter(":visible:odd");

    evenRows.css("background-color", "rgb(33, 44, 68)");
    oddRows.css("background-color", "rgb(27, 28, 54)");
}

/** This function applies the row styling, which includes the alternating row styling (by calling applyRowColorStyling) and a brightness filter on hover.*/
function applyRowStyling() {
    applyRowColorStyling(true);

    $(".mainTr, .nestedEntry").hover(
        function () {
            $(this).css("filter", "brightness(117%)");
        },
        function () {
            $(this).css("filter", "brightness(100%)")
        }
    );
}

/** The state of the button is implicitly saved through the value of the style.transform attribute.
 * If the button is not expanded, the value is "", else the value is "rotate(90deg)".*/
function buttonIsExpanded(button) {
    return button.style.transform == "rotate(90deg)";
}

function changeExpandButtonIcon(button, reset) {
    if (reset) {
        button.style.transform = "";
        button.style.paddingLeft = "";
    } else {
        button.style.transform = "rotate(90deg)";
        button.style.paddingLeft = "5px"; // Rotating the button messes up the padding. This adjustment is necessary.
    }
}

function createRowExpandButton(expanded) {
    let button = document.createElement('button');
    button.type = "button";
    button.classList.add("expandButton");
    button.textContent = "\u3009";

    if (expanded) {
        button.style.transform = "rotate(90deg)";
        button.style.paddingLeft = "5px";
    }

    return button;
}

/** This function creates the expansion buttons and adds them to the first td (i.e. first entries of the first column) and adds the corresponding event listeners.
 * If the row contains JSON data, the JSON buttons and event listeners are added accordingly. Nested JSON data can be expanded fully until depth ~15 or so.
 * Starting at depth ~15 the (right) end of the table is reached and the overflow will be clipped. */
function setupRowExpansion() { // TODO: NICE TO HAVE: fix JSON depth expansion limit
    for (let tr of $('.mainTr')) {
        let button = createRowExpandButton(false);
        let firstTd = tr.children[0];
        firstTd.prepend(button);
    }

    addExpandButtonEventListeners(true);
}

/** Users may expand rows and toggle columns (hide/show them) freely. When a row is expanded and all columns of the table are hidden,
 * and then re-shown, the expanded row is reset. This function also resets the expansion buttons. */
function resetRowExpansionButtons() {
    $('.mainTr').each(function () {
        $(this).children().each(function () {
            if ($(this)[0].childNodes.length == 2) {
                let button = $(this)[0].childNodes[0];
                $(this)[0].removeChild(button);
            }
        })
    })

    addRowExpansionButtonToFirstVisibleColumn();
}

/** The row expansion button is always added to the first entry of the first column.
 * When this column is hidden (filtered out by the user), the new first entry of the first column needs to have an expansion button.
 * This function creates a new button and adds corresponding event listeners.*/
function addRowExpansionButtonToFirstVisibleColumn() {
    let targetColumn = $('.mainTr').first().children(":visible").first();
    if (targetColumn.length == 0 || targetColumn[0].childNodes.length == 2) { // i.e. button is present
        return;
    }

    let targetColumnIndex = targetColumn.index();
    $('.mainTr').each(function () {
        let expanded = $(this).next().is(".expansionWindow");
        let button = createRowExpandButton(expanded);
        $(this).children(":visible").first()[0].prepend(button);
    })

    addExpandButtonEventListeners(false);
}

/** This function returns a list of all column names. Though not as efficient as possible when called multiple times,
 * this function avoids the need for a global variable COLUMN_NAMES, which could potentially be misused.*/
function getColumnNames() {
    let columnNames = [];

    $('.mainTr').first().children().each(function () {
        columnNames.push($(this)[0].getAttribute('data-column'))
    })

    return columnNames;
}

/** This function dynamically adds the column names to the static dropdown which manages column visibility. */
function initializeColumnVisibilityDropdown(columnNames) {
    let parent = document.getElementById("columnVisibilityDropdown");

    for (let i = 0; i < columnNames.length; i++) {
        let columnName = columnNames[i];

        let columnFilterElement = document.createElement('div');
        columnFilterElement.classList.add("columnSelect");

        let checkbox = document.createElement("input");
        let checkboxId = "columnCheckbox" + (i + 1);
        checkbox.classList.add("columnFilterCheckbox");
        checkbox.setAttribute("type", "checkbox");
        checkbox.setAttribute("id", checkboxId);
        checkbox.setAttribute("index", i);
        checkbox.checked = true;

        let label = document.createElement("label");
        label.setAttribute("for", checkboxId);
        label.textContent = columnName;

        columnFilterElement.appendChild(checkbox);
        columnFilterElement.appendChild(label);
        parent.appendChild(columnFilterElement);
    }
}

/** This function handles the "Select All" functionality of the column visibility dropdown. */
function toggleAllColumns(showColumns) {
    if (showColumns) {
        $('tr').children(":hidden").show();
        updateColumnWidth();
        resetRowExpansionButtons();
    } else {
        $('tr').children(":visible").hide();
        updateColumnWidth();
    }
}

/** This function updates the display when a column is toggled (hidden/shown) in the column visibility dropdown. */
function toggleColumnDisplay(index, showColumn) {
    $('tr:not(.expansionWindow)').each(function () {
        let trColumn = $(this).children().eq(index);

        if (showColumn) trColumn.show();
        else trColumn.hide();
    })
}

/**
 * This function handles the hiding/showing of a column and updates the display, the checkbox tick in the column visibility dropdown,
 * the column width (since that is dependent on the number of columns) and if the new, toggled column is first in the table, the
 * row expansion is reset (so that the first entry of the first column will contain the row expansion button).
 * @param index - Index of the column (regardless of whether the column is visible or hidden)
 * @param showColumn - Whether the column should be hidden or shown.
**/
function toggleColumn(index, showColumn) {
    let firstVisibleColumn = $('.mainTr').first().children(":visible").first();
    toggleColumnDisplay(index, showColumn);

    // Update SelectAll checkbox tick when necessary:
    if ($('tr').first().children(":visible").length == 0 || $('tr').first().children(":hidden").length == 0) {
        $('#selectAllCheckbox')[0].checked = showColumn;
    }

    // Adjust column width:
    let visibleNumColumns = $('tr').eq(0).children(":visible").length;
    if (visibleNumColumns > 4) updateColumnWidth();

    if (firstVisibleColumn.index() < index) return; // If first visible column is unaffected, the expansion button can stay where it is

    resetRowExpansionButtons();
}

/** This function adds the event listeners for the checkboxes in the column visibility dropdown. When fired, the selected column will be 
 * toggled and potential expanded rows will be updated (i.e. the column will be hidden/shown in the expansion as well).
*/
function addColumnFilterCheckboxEventListener(columnNames) {
    $('.columnFilterCheckbox').change(function () {
        let index = parseInt($(this)[0].getAttribute("index"));
        let checked = $(this)[0].checked;
        toggleColumn(index, checked);

        let columnName = $(this).siblings()[0].textContent;
        if (!checked) {
            removeColumnFromAllExpansions(columnName);
        } else {
            addColumnToAllExpansions(columnName, columnNames);
        }
    })
}

/** This function works similarly to the addColumnFilterCheckboxEventListener() function. */
function addSelectAllColumnFilterEventListener() {
    $('#selectAllCheckbox').change(function () {
        let check = this.checked;
        toggleAllColumns(check);

        $('.columnFilterCheckbox').each(function () {
            this.checked = check;
        });

        if (!check) {
            collapseAllExpansions();
        }
    })
}

/* This function returns the relative index of the previous entry (within the expansion window). */
function getIndexOfPrevEntry(columnName, columnNames) {
    let indexOfColumn = columnNames.indexOf(columnName);
    let expandedColumnIndices = [];

    $('.expandTable').first().children(":nth-child(even)").each(function (index, element) {
        let currColumnName = element.children[1].textContent;
        expandedColumnIndices.push(columnNames.indexOf(currColumnName));
    })

    // case: column is inserted at position 0
    if (expandedColumnIndices.length == 0 || indexOfColumn < expandedColumnIndices[0]) {
        return null;
    }

    // case: column is inserted at position 1+. here we want to get the maximum index that is still smaller than indexOfColumn
    for (let i = 1; i < expandedColumnIndices.length; i++) {
        let columnIndex = expandedColumnIndices[i];

        if (columnIndex > indexOfColumn) {
            return i - 1;
        }
    }

    return null;
}

function addColumnToAllExpansions(columnName, columnNames) {
    let visibleDataTds = $('.expansionWindow').prev().children(":visible");
    let indexOfPrevEntry = getIndexOfPrevEntry(columnName, columnNames);

    visibleDataTds.each(function () {
        let dataTd = $(this);
        let targetColumnName = $(this)[0].getAttribute("data-column");
        let nestedTable = $(this).closest('.mainTr').next().children().first().children();

        if (columnName == targetColumnName) {
            addExpandedRowEntry(dataTd, nestedTable, indexOfPrevEntry);
        }
    })
}

function removeColumnFromAllExpansions(targetColumnName) {
    $('.expandedRow').each(function () {
        let columnName = $(this)[0].children[1].textContent;

        if (columnName == targetColumnName) {
            $(this).next().remove(); // removes the <hr>
            $(this).remove();
        }
    })
}

function addColumnVisibilityDropdownEventListener() {
    $('#columnVisibilityButton').on('click', function (e) {
        $(this).next().toggle(TOGGLE_ANIMATION_MS);
    })
}

function collapseAllExpansions() {
    $('.expansionWindow').each(function () {
        $(this)[0].remove();
    })
}

function addExpandButtonEventListeners(firstCall) {
    let buttons = firstCall ? $('.expandButton') : $('.expandButton').filter(':visible'); // this aims to fix issues where the button click is not registered (this behavior is fixed with a page refresh; perhaps this function is called when the state of the buttons is still "hidden")

    buttons.on('click', function () {
        let expandButton = $(this)[0];
        let trObj = $(this).closest('tr');
        let index = $('.mainTr').index(trObj);

        if (buttonIsExpanded(expandButton)) {
            trObj.next()[0].remove();
            changeExpandButtonIcon(expandButton, true);
            return;
        }

        expandRow(trObj, index);
        prepareJsonExpansion();
        changeExpandButtonIcon(expandButton, false);
    })
}

function getChildExpansion(row) {
    let potentialChildExpansion = row.nextSibling.nextSibling //: row.parentElement.lastElementChild;

    if (potentialChildExpansion != null && potentialChildExpansion.classList.contains("childExpansion")) {
        return potentialChildExpansion;
    }

    return null;
}

/**
 * TODO: NICE TO HAVE: The regular row expansion collapses expansions based on the button icon. This may be 
 * possible here as well and might simplify the collapsing logic.
 */
function addJsonExpansionEvent(jsonButton, row) {
    $(jsonButton).on('click', function () {
        let isExpanded = false;
        let childExpansion = getChildExpansion(row);
        if (childExpansion != null) { // case: collapse
            childExpansion.remove();
            changeExpandButtonIcon(jsonButton, true);
            return;
        }

        let jsonData = $(this).next().next()[0].value;
        expandJson(jsonData, row);
        changeExpandButtonIcon(jsonButton, false);
        prepareJsonExpansion();
    })
}

/**
 * This function will take data and a previously created table to create a new row (and separator element) and add it to the table.
 * @param dataTd - A JQuery object of a <dataTd>
 * @param table - The expansion table that the entry will be added into.
 * @param indexOfPrevEntry - The relative index of the previous entry within the expansion.
 * */
function addExpandedRowEntry(dataTd, table, indexOfPrevEntry) {
    let columnNames = getColumnNames(); // this is a special case where passing columnNames as a parameter is unfeasible due to long chain of function calls.
    let td = dataTd[0];
    let i = dataTd.index();

    let key = columnNames[i];
    let childNodes = td.cloneNode(true).childNodes; // this is necessary because we can't just access td.textContent (this is the case because columns that contain a button will count that button as part of the textContent)
    let text = extractTextFromChildNodes(childNodes);
    let nestedEntry = addNestedEntry(key, text, BASE_INDENT, style = td.style);
    let hr = document.createElement('hr');
    hr.style.marginLeft = (BASE_INDENT - BASE_INDENT_OFFSET) + "px";
    if (dataTd.is(":last-child")) hr.style.marginBottom = "0px";

    if (indexOfPrevEntry == null) {
        table.append(nestedEntry);
        table.append(hr);
    } else {
        let prevEntry = table.children(":nth-child(even)").get(indexOfPrevEntry);
        let hrOfPrevEntry = $(prevEntry).next();
        hrOfPrevEntry.after($(nestedEntry), $(hr));
    }
}

function expandRow(trObj, index) {
    let [wrapper, nestedTable] = prepareExpandTable(index);

    $(".mainTr").eq(index).children(":visible").each(function () {
        addExpandedRowEntry($(this), nestedTable, null);
    })

    trObj[0].insertAdjacentElement("afterend", wrapper);
}

function prepareJsonExpansion() {
    let expansionData = $(".expandedDataValue");
    if (expansionData.length == 0) return;


    for (let dataValue of expansionData) {
        if (dataValue.getAttribute("data-expansion-processed") != null) continue;
        dataValue.setAttribute("data-expansion-processed", true)

        let row = dataValue.parentElement;
        if (row.getElementsByClassName("jsonButton").length > 0) continue;

        let potentialJsonString = dataValue.value;
        let jsonData = tryGetJSON(potentialJsonString, warn = false);
        let valueIsJson = jsonData != null;

        if (valueIsJson) {
            let expandButton = document.createElement('button');
            expandButton.classList.add("jsonButton");
            expandButton.textContent = "\u3009";
            addJsonExpansionEvent(expandButton, row);
            row.insertBefore(expandButton, row.children[1]); // child 0 is the indent, child 1 is the key
            let buttonWidth = parseInt(window.getComputedStyle(expandButton).getPropertyValue('width'), 10);
            let buttonMarginRight = parseInt(window.getComputedStyle(expandButton).getPropertyValue('margin-right'), 10);
            let indent = parseInt(row.children[0].style.width, 10);
            row.children[0].style.width = (indent - buttonWidth - buttonMarginRight) + "px";
        }
    }
}

/**
 * This function is used to extract the column information during the row expansion process.
 * Usually, a column contains only one element: either text or an a-element. However, if the column contains
 * json data, an additional button element is added to the value in order to make it clickable/expandable.
 * This function simply filters out such buttons.
 * NOTE: To access the text of the column correctly its childNodes are accessed. These childNodes are a NodeList,
 * which has the quirk that its maximum size per element (in some browsers presumeably) is 65536 or 2^16. If an
 * element exceeds this amount, an additional element in the NodeList is created. I.e a string containing 70000
 * characters gets broken up into two elements in the NodeList with sizes 65536 and 4464. 
 * 
 * @param childNodes - a childNodes element that is usually of the form [text], [a], [button, text] or in some cases having more than just one text element.
 * */
function extractTextFromChildNodes(childNodes) {
    if (childNodes.length == 0) return null;

    let text = "";
    for (let node of childNodes) {
        if (node.nodeType === Node.ELEMENT_NODE && node.tagName === 'BUTTON') continue;

        let childNodeText = node.nodeValue;
        if (typeof childNodeText != "string") continue; // failsafe; this condition should never be true, but this check here is just in case 

        text += childNodeText;
    }

    return text;
}

function expandJson(jsonString, row) {
    let jsonData = tryGetJSON(jsonString); // TODO: NICE TO HAVE: right now the approach is: check if data is json => if yes, add it as textContent => on click, take textContent and turn it back into JSON. this is less than ideal
    let parent = row.parentElement;
    let parentIndent = parseInt(row.children[0].style.width, 10);
    let indent = parentIndent + 2 * BASE_INDENT;
    let nextRow = row.nextSibling.nextSibling;
    let wrapper = document.createElement('div');
    wrapper.classList.add("childExpansion");

    let finalHr = null;
    for (let key of Object.keys(jsonData)) {
        let value = jsonData[key];
        let text = typeof value === "object" ? JSON.stringify(value) : value;
        let nestedEntry = addNestedEntry(key, text, indent, null);
        let hr = document.createElement('hr');
        hr.style.marginLeft = (indent - 15) + "px";

        wrapper.appendChild(nestedEntry);
        wrapper.appendChild(hr);

        finalHr = hr;
    }

    parent.insertBefore(wrapper, nextRow);

}

function prepareExpandTable() {
    // <tr> -> <td> are the outermost containers to allow for correct insertion in current table
    let tr = document.createElement('tr');
    let td = document.createElement('td');
    let nestedTable = document.createElement('div');
    let topSpacing = document.createElement('div');

    let numColumns = $("tr").first()[0].children.length;
    td.colSpan = numColumns;
    tr.classList.add("expansionWindow");
    nestedTable.style = "background-color: rgb(25, 36, 59); overflow: hidden;";
    nestedTable.classList.add("expandTable");
    topSpacing.style = "height: 10px;";

    tr.appendChild(td);
    td.appendChild(nestedTable);
    nestedTable.appendChild(topSpacing);

    return [tr, $(nestedTable)];
}

function addNestedEntry(key, text, indent, style = null) {
    let nestedEntry = document.createElement('div');
    let indentElement = document.createElement('div');
    let dataKey = document.createElement('div');
    let dataValue = document.createElement('div');

    nestedEntry.classList.add("expandedRow");
    nestedEntry.style = "display: flex; height: 20px; line-height: 20px;";

    indentElement.style.width = indent + "px";
    dataKey.textContent = key;
    dataKey.style = "width: 200px; margin-right: 30px; overflow: hidden; text-overflow: clip; white-space: nowrap; font-size: small; font-weight: bold; display: flex; align-items: center;";


    let textOverflows = false;
    if (text != null) {
        let maxChars = 140;
        textOverflows = text.length > maxChars;
        let visibleText = textOverflows ? text.substring(0, maxChars) + "..." : text;
        dataValue.appendChild(document.createTextNode(visibleText));
    }
    dataValue.classList.add("expandedDataValue");
    dataValue.style = "width: 1000px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: small; display: block;";
    dataValue.value = text;

    if (style != null) dataValue.style.color = style.color;

    if (textOverflows) {
        dataValue.title = text;
    }

    nestedEntry.appendChild(indentElement);
    nestedEntry.appendChild(dataKey);
    nestedEntry.appendChild(dataValue);

    return nestedEntry;
}

function getNumVisibleColumns() {
    return $('tr').first().children(":visible").length;
}

function updateColumnWidth() {
    let visibleNumColumns = getNumVisibleColumns();
    if (visibleNumColumns > DEFAULT_NUM_COLUMNS) return;

    let columnWidth = TABLE_WIDTH / visibleNumColumns;
    $(".mainTh").css("width", "" + columnWidth + "px");
    $(".mainTh").css("min-width", "" + columnWidth + "px");

    $(".dataTd").css("width", "" + columnWidth + "px");
    $(".dataTd").css("min-width", "" + columnWidth + "px");

    $(".tablesorter-header").css("width", "" + columnWidth + "px");
    $(".tablesorter-header").css("min-width", "" + columnWidth + "px");
}

// TODO: NICE TO HAVE: currently the input field does not allow commands like CTRL+A
function setupTableHeaders(columnNames) {
    let TH_TEMPLATE = `
            <div class="headerText"></div>
            <div class="functionBar dropdownParent">
                <div class="filterIconContainer dropdownTrigger"><div class="filterIcon">&#9906;</div></div>
                <div class="dropdown columnFilterDropdown">
                    <div>
                        <select name="text-filters" class="text-filters">
                            <option value="contains">Contains</option>
                            <option value="not-contains">Not contains</option>
                            <option value="equals">Equals</option>
                            <option value="not-equals">Not equals</option>
                            <option value="starts-with">Starts with</option>
                            <option value="ends-with">Ends with</option>
                        </select>
                    </div>
                    <div>
                            <input class="filterInput" type="text" placeholder="Filter...">
                    </div>
                </div>
                <div class="sortIcon">
                    <div class="upArrow">&uarr;</div>
                    <div class="downArrow">&darr;</div>
                </div>
                <div class="resizeArea">
                    <div class="separator">|</div>
                </div>
            </div>`;

    let tableHeaderRow = document.getElementById("tableHeaderRow");
    for (let i = 0; i < columnNames.length; i++) {
        let originalColumnName = columnNames[i];
        let columnName = columnNames[i].toUpperCase();
        let th = document.createElement('th');
        th.classList.add("mainTh");
        th.insertAdjacentHTML("beforeend", TH_TEMPLATE);
        th.children[0].setAttribute('originalColumnName', originalColumnName);
        th.children[0].textContent = columnName;
        tableHeaderRow.appendChild(th);
    }
}

function setupRecordsDisplay() {
    let numRecords = $('.mainTr').length;

    document.getElementById("numRecords").textContent = numRecords;
    document.getElementById("numRecordsText").textContent = numRecords == 1 ? "Record Found" : "Records Found";
}


function extractTimebasedColumns(columnNames) {
    let timestampColumnIndices = [];
    for (let i = 0; i < columnNames.length; i++) {
        let columnName = columnNames[i];
        if (isTimestampColumn(columnName)) {
            timestampColumnIndices.push(i);
        }
    }

    return timestampColumnIndices;
}

function extractSeverityColumns(columnNames) {
    // 1. extract potential severity column candidates based on the column name
    let severityColumnIndices = [];
    let severityColumnCandidates = [];
    for (let i = 0; i < columnNames.length; i++) {
        let columnName = columnNames[i];
        if (isSeverityColumn(columnName)) {
            severityColumnCandidates.push(i);
        }
    }

    // 2. check if all entries of the column are severities and if so, extract the column
    for (let severityColumnCandidate of severityColumnCandidates) { // usually the number of candidates is equal to one, i.e. this for loop just runs once on average
        let allEntriesAreSeverities = true;

        let rows = $("tr").toArray();
        for (let i = 1; i < rows.length; i++) {
            let currentColumn = rows[i].children[severityColumnCandidate];
            if (!currentColumn || !currentColumn.textContent || !currentColumn.textContent.trim()) continue;

            let data = currentColumn.textContent;

            if (!isSeverityData(data)) {
                allEntriesAreSeverities = false;
                break;
            }
        }

        if (allEntriesAreSeverities) {
            severityColumnIndices.push(severityColumnCandidate);
        }
    }

    return severityColumnIndices;
}

function modifyTimestamp(td, timestamp) {
    let modifiedTimestamp = prettyTimestamp(timestamp);
    let childNodes = td.childNodes;

    if (childNodes.length == 1) {
        td.textContent = modifiedTimestamp;
        return;
    }

    // case: childNodes.length == 2, i.e. td contains an expansion button
    td.childNodes[1].nodeValue = modifiedTimestamp;

}

function postprocessHtmlElements(severityColumnIndices, timestampColumnIndices, numColumns) {
    let rows = $("tr").toArray();
    for (let i = 0; i < rows.length; i++) {
        let tr = rows[i];
        for (let columnIndex = 0; columnIndex < numColumns; columnIndex++) {
            let td = i == 0 ? tr.children[columnIndex].children[0] : tr.children[columnIndex];
            if (!td || !td.textContent.trim()) continue;

            let data = td.childNodes[td.childNodes.length - 1].textContent;

            // Add text preview on hover for long text:
            if (data.length >= 30 && !td.classList.contains("mainTh")) { // mainTh left out due to its textContent being irrelevant
                td.title = data;
            }

            if (i == 0) continue;

            // Add styling if this is severity data:
            if (severityColumnIndices.includes(columnIndex)) {
                td.style = getSeverityColor(data);
            }

            // Make the timestamp more readable if it's timestamp data:
            if (timestampColumnIndices.includes(columnIndex)) {
                modifyTimestamp(td, data) // TODO: fix issue/test
            }
        }
    }
}

function setupTablesorter(severityColumnIndices, timestampColumnIndices) {
    // Add custom severity parser
    $.tablesorter.addParser({
        id: 'severity',
        is: function (str) {
            return false;
        },
        format: function (str) {
            let severities = {
                "critical": 0,
                "high": 1,
                "medium": 2,
                "low": 3,
                "informational": 4
            }

            let order;
            str = str.toLowerCase();
            if ((str in severities)) order = severities[str]
            else order = 5;

            return order;
        },
        type: 'numeric'
    })

    // Set correct sorting mechanism for timebased and severity columns
    let configurationOptions = {}

    for (let severityColumnIndex of severityColumnIndices) {
        configurationOptions[severityColumnIndex] = { sorter: 'severity' };
    }

    for (let timestampColumnIndex of timestampColumnIndices) {
        configurationOptions[timestampColumnIndex] = { sorter: 'text' };
    }

    $("table")
        .tablesorter({
            selectorSort: '.sortIcon',
            headers: configurationOptions,
            sortReset: true
        })

        .bind("sortEnd", function (e, t) {
            applyRowColorStyling(false)
        });
}

/* TODO: NICE TO HAVE: This function removes all expansion windows and is used when the table is sorted while an expansion window is active. 
    Ideally, each expanded window should be bound to the corresponding <tr> but since that requires quite a bit more code
    the simpler solution is to delete all expansion windows on tablesort. */
function removeAllExpandWindows() {
  $(".expansionWindow").each(function () {
    const $exp = $(this);

    // Versuche, die vorherige Datenzeile zu finden
    const $prevRow = $exp.prev('tr');

    if ($prevRow.length) {
      // Suche explizit nach dem Button-Element der Expand-Funktion
      const btnEl = $prevRow.find('button.expandButton').get(0);
      if (btnEl) {
        try {
          changeExpandButtonIcon(btnEl, true);
        } catch (e) {
          console.warn('changeExpandButtonIcon failed:', e);
        }
      }
    }

    // Entferne das Expansion-Window immer (unabhängig davon, ob ein Button gefunden wurde)
    $exp.remove();
  });
}

function setupSortIconDisplay() {
    $('.sortIcon').on('click', function (e) {
        let upArrow = e.currentTarget.children[0];
        let downArrow = e.currentTarget.children[1];
        let upArrowColor = window.getComputedStyle(upArrow).color;
        let downArrowColor = window.getComputedStyle(downArrow).color;
        let white = "rgb(255, 255, 255)";
        let black = "rgb(0, 0, 0)";

        if (upArrowColor == white && downArrowColor == white) {
            // reset all arrow colors
            let sortIcons = document.getElementsByClassName('sortIcon')
            for (let i = 0; i < sortIcons.length; i++) {
                let arrows = sortIcons[i].children;
                for (let j = 0; j < arrows.length; j++) {
                    arrows[j].style.color = white;
                }
            }

            // then deactivate downArrow (first click is ascending)
            downArrow.style.color = black;
        } else if (upArrowColor == white && downArrowColor == black) {
            upArrow.style.color = black;
            downArrow.style.color = white;
        }
        else if (upArrowColor == black && downArrowColor == white) {
            upArrow.style.color = white;
            downArrow.style.color = white;
        }

        removeAllExpandWindows();
    })
}

function hideDropdowns() {
    $('.dropdown:visible').toggle(TOGGLE_ANIMATION_MS);
}

function setupDropdownMenus() {
    $('.dropdownTrigger').on('click', function (e) {
        let alreadyOpenedDropdown = $(".dropdown:visible").first();
        let parent = $(this).closest(".dropdownParent");
        let dropdown = parent.find(".dropdown");

        if (alreadyOpenedDropdown[0] != dropdown[0]) { // reset all open dropdowns if necessary        
            hideDropdowns();
        }

        dropdown.toggle(TOGGLE_ANIMATION_MS);
        e.stopPropagation();
    })

    setupDropdownClosing();
}

function setupDropdownClosing() {
    $("html").on('click', function (e) {
        if ($('.dropdown:visible').length == 0) return;

        let clickWasOutsideOfDropdown = e.target.closest('.dropdown') == null;
        if (clickWasOutsideOfDropdown) hideDropdowns();
    })
}

function resetFilterAfterModeChange() {
    let dropdownMenu = $(this).closest('.columnFilterDropdown')[0];
    dropdownMenu.children[1].children[0].value = "";

    $('tbody .mainTr').filter(function () {
        $(this).toggle(true);
    })
}

function toggleFilter() {
    removeAllExpandWindows();

    let columnIndex = $(this).closest('th').index();
    let filterValue = $(this).val().toLowerCase();
    let filterMode = $(this).closest('.columnFilterDropdown')[0].children[0].children[0].value; // TODO: NICE TO HAVE: should probably find a better way to do this

    $('tbody .mainTr').filter(function () {
        let entry = $(this)[0].children[columnIndex];
        let value;

        if (!entry.childNodes[0]) return;

        if (entry.childNodes[0].type == "button") {
            value = entry.childNodes[1].textContent.toLowerCase();
        } else {
            value = entry.childNodes[0].textContent.toLowerCase();
        }

        if (filterValue.length == 0) {
            $(this).toggle(true);
        } else if (filterMode == "contains") {
            $(this).toggle(value.indexOf(filterValue) != -1)
        } else if (filterMode == "not-contains") {
            $(this).toggle(value.indexOf(filterValue) == -1)
        } else if (filterMode == "equals") {
            $(this).toggle(value == filterValue)
        } else if (filterMode == "not-equals") {
            $(this).toggle(value != filterValue)
        } else if (filterMode == "starts-with") {
            $(this).toggle(value.startsWith(filterValue))
        } else if (filterMode == "ends-with") {
            $(this).toggle(value.endsWith(filterValue))
        }

        applyRowColorStyling(false);
    })
}

function setupFiltering() {
    $('.filterInput').on("keyup", toggleFilter);
    $('.text-filters').on("change", resetFilterAfterModeChange)
}

function setupInitialFunctionBarPosition() {
    let tableHeaders = document.getElementById('mainTable').querySelectorAll('th');

    for (let i = 0; i < tableHeaders.length; i++) {
        let functionBar = tableHeaders[i].children[0].children[1];
        let width = parseFloat(window.getComputedStyle(tableHeaders[i]).width, 10);
        let newLeft = ((width - FUNCTION_BAR_OFFSET) / width) * 100;
        functionBar.style.left = `${newLeft}%`;
    }
}

function tryGetJSON(potentialJSONString, warn = true) {
    if (potentialJSONString == "[]" || potentialJSONString == "{}" || potentialJSONString == "" || potentialJSONString == " ") return null; // TODO: find more sophisticated way to prevent dummy json data

    try {
        let jsonData = JSON.parse(potentialJSONString);
        if (jsonData && typeof jsonData === "object") return jsonData;
        else return null;
    } catch (e) {
        if (warn) console.log("The provided JSON could not be parsed. The error message reads:\n", e);
        return null;
    }
}

function jsonIsArray(jsonData) {
    return Array.isArray(jsonData);
}

function getDataColumns() {
    let columnNames = [];
    let firstTr = $('.mainTr')[0];
    if (firstTr == null) return [];

    for (let td of firstTr.children) {
        let column = td.getAttribute('data-column'); // (!!!) relies on attribute to be set by the data source 
        columnNames.push(column)
    }

    return columnNames;
}

function isTimestampColumn(str) {
    return stringIsInArray(str, ["timegenerated", "timestamp", "datetime"])
}

function stringIsInArray(str, targets) {
    let normalizedString = normalize(str);
    return targets.includes(normalizedString);
}

function isSeverityColumn(str) {
    return stringIsInArray(str, ["alertseverity", "severity"]);
}

function isSeverityData(str) {
    let normalizedString = normalize(str);
    let severities = ["critical", "high", "medium", "low", "informational"];
    return severities.includes(normalizedString);
}

function getSeverityColor(severity) {
    let normalizedSeverity = normalize(severity);

    if (normalizedSeverity == 'critical') return "color: #ff353f; font-weight: bold;";
    if (normalizedSeverity == 'high') return "color: #e6653e; font-weight: bold;";
    if (normalizedSeverity == 'medium') return "color: #f2c94c;";
    if (normalizedSeverity == 'low') return "color: #27ae60;";

    return "color: white;";
}

/** Sets string to lowercase and removes all whitespace.**/
function normalize(val) {
    if (val == null || val == undefined) return "";

    let str = val;
    if (typeof val !== "string") str = val.toString();
    return str.toLowerCase().replace(/\s+/g, '');
}

/** The function bar has display:inline-block and uses the CSS-attributes "top", "left", and "transform:translate()" to position its elements
* (because block elements wrap to new line on resize and flex elements can't be dynamically resized effectively).
* Since "left" is expressed in percentages, resizing an object changes the value of "left" and has to be corrected.
* This function achieves this correction by simply calculating the new ratio: (x-offset)/x, where offset is half of the length of the function bar
* (because the origin of "left" is in the center, not its left).
**/
function correctFunctionBarPosition(newWidth, newNeighborWidth, column, neighborColumn) {
    let functionBar = column[0].children[0].children[1];
    let newLeft = ((newWidth - FUNCTION_BAR_OFFSET) / newWidth) * 100;
    functionBar.style.left = `${newLeft}%`;

    let neighborFunctionBar = neighborColumn[0].children[0].children[1];
    let newNeighborLeft = ((newNeighborWidth - FUNCTION_BAR_OFFSET) / newNeighborWidth) * 100;
    neighborFunctionBar.style.left = `${newNeighborLeft}%`;
}

function correctHeaderTextWidth(newWidth, newNeighborWidth, column, neighborColumn) {
    // Prevent headerText element from blocking further shrinkage of the column:
    let newHeaderTextWidth = newWidth * HEADER_TEXT_WIDTH_RATIO;
    column[0].children[0].children[0].style.width = `${newHeaderTextWidth}px`;

    let newNeighborHeaderTextWidth = newNeighborWidth * HEADER_TEXT_WIDTH_RATIO;
    neighborColumn[0].children[0].children[0].style.width = `${newNeighborHeaderTextWidth}px`;
}

function adjustHeaderTextWidth(headerText, newWidth) {
    let newHeaderTextWidth = (newWidth / 5) * 4;
}

function resizeColumn(e, startX, column, neighborColumn) {
    if (neighborColumn.length == 0) return;

    let deltaX = e.pageX - startX; // Calculate how much the cursor moved
    let sign = deltaX <= 0 ? 1 : -1;

    // Collect start width values:
    let width = column[0].offsetWidth;
    let neighborWidth = neighborColumn[0].offsetWidth;
    // Caculate new width values:
    let newWidth = width + deltaX;
    let newNeighborWidth = neighborWidth - deltaX;

    for (let i = 0; i < column.length; i++) {
        if (newWidth <= MIN_TABLE_HEADER_WIDTH || newNeighborWidth <= MIN_TABLE_HEADER_WIDTH) {
            return;
        }

        if (i == 0) {
            correctFunctionBarPosition(newWidth, newNeighborWidth, column, neighborColumn);
            correctHeaderTextWidth(newWidth, newNeighborWidth, column, neighborColumn);
        }

        column[i].style.minWidth = `${newWidth}px`;
        column[i].style.width = `${newWidth}px`;

        neighborColumn[i].style.minWidth = `${newNeighborWidth}px`;
        neighborColumn[i].style.width = `${newNeighborWidth}px`;
    }
}

function setupColumnResizing() {
    let numColumns = getNumVisibleColumns();
    $(".resizeArea").on('mousedown', function (e) {
        let index = $(this).closest('th').index(); // Index of the current column that is being moved
        if (index == numColumns - 1) return;

        let neighborIndex = $(this).closest('th').nextAll(":visible").first().index();
        let column = [];
        let neighborColumn = [];
        let rows = $("tr").toArray();
        for (let i = 0; i < rows.length; i++) {
            column[i] = rows[i].children[index];
            if (neighborIndex != -1) neighborColumn[i] = rows[i].children[neighborIndex];
        }

        let startX = e.pageX; // Track starting position of cursor when drag button is clocked
        document.addEventListener('mousemove', handleResize);
        document.addEventListener('mouseup', handleResizeEnd);

        function handleResizeEnd(_) {
            document.removeEventListener('mousemove', handleResize);
            document.removeEventListener('mouseup', handleResizeEnd);
        }

        function handleResize(e) {
            resizeColumn(e, startX, column, neighborColumn);
            startX = e.pageX;
        }
    });
}


function extractTableAsText() {
    const lines = [];
    $('.mainTr:visible').each(function () {
        const cols = [];
        $(this).children(':visible').each(function () {
            const txt = (this.childNodes.length > 1
                ? this.childNodes[this.childNodes.length - 1].textContent
                : this.textContent).trim();
            cols.push(txt);
        });
        lines.push(cols.join(' | '));
    });
    return lines.join('\n');
}


function extractTableAsCSV() {
    let lines = [];

    // Header
    let header = [];
    $('#tableHeaderRow').children(':visible').each(function () {
        header.push($(this).find('.headerText').text().trim());
    });
    lines.push(header.join(";"));

    // Rows
    $('.mainTr:visible').each(function () {
        let row = [];
        $(this).children(':visible').each(function () {
            let txt = this.childNodes.length > 1
                ? this.childNodes[this.childNodes.length - 1].textContent.trim()
                : this.textContent.trim();

            if (txt.includes(";") || txt.includes('"'))
                txt = `"${txt.replace(/"/g, '""')}"`;

            row.push(txt);
        });
        lines.push(row.join(";"));
    });

    return lines.join("\n");
}

async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        alert("Tabelle kopiert!");
    } catch (err) {
        // Fallback
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        alert("Tabelle kopiert (Fallback)!");
    }
}

function downloadCSV(text) {
    let blob = new Blob([text], { type: "text/csv;charset=utf-8;" });
    let url = URL.createObjectURL(blob);

    let a = document.createElement("a");
    a.href = url;
    a.download = "table_export.csv";
    a.click();
    URL.revokeObjectURL(url);
}

// --- NEW: HTML in Zwischenablage kopieren (bevorzugt 'text/html', Fallback execCommand) ---
async function copyHTMLToClipboard(html) {
    try {
        if (navigator.clipboard && window.ClipboardItem) {
            const item = new ClipboardItem({
                'text/html': new Blob([html], { type: 'text/html' }),
                'text/plain': new Blob([stripHtml(html)], { type: 'text/plain' })
            });
            await navigator.clipboard.write([item]);
            alert("HTML kopiert!");
        } else {
            // Fallback: contenteditable-Knoten selektieren und kopieren
            const div = document.createElement('div');
            div.contentEditable = 'true';
            div.style.position = 'fixed';
            div.style.opacity = '0';
            div.style.left = '-9999px';
            div.innerHTML = html;
            document.body.appendChild(div);
            const range = document.createRange();
            range.selectNodeContents(div);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
            document.execCommand('copy');
            document.body.removeChild(div);
            alert("HTML kopiert (Fallback)!");
        }
    } catch (e) {
        console.error("Copy HTML failed:", e);
        alert("HTML-Export fehlgeschlagen (siehe Konsole).");
    }
}

// --- NEW: „sauberes“ HTML-Table aus den sichtbaren Spalten/Zeilen generieren ---
//  - Erhält Links/Inline-HTML in Zellen
//  - Entfernt Expand-Buttons aus Zellen
//  - Optional: überträgt einfache Inline-Styles der Zelle (z.B. Farbe)
function extractTableAsHTML({ includeHeader = true, preserveCellStyle = false } = {}) {
    // Header einsammeln (nur sichtbare)
    const headers = [];
    $('#tableHeaderRow').children(':visible').each(function () {
        headers.push($(this).find('.headerText').text().trim());
    });

    // Zeilen (nur sichtbare .mainTr und deren sichtbare Zellen)
    const bodyRows = [];
    $('.mainTr:visible').each(function () {
        const tds = [];
        $(this).children(':visible').each(function () {
            const cellHTML = getCellInnerHTMLWithoutExpandButton(this);
            const style = preserveCellStyle ? (this.getAttribute('style') || '') : '';
            tds.push(style ? `<td style="${style}">${cellHTML}</td>` : `<td>${cellHTML}</td>`);
        });
        bodyRows.push(`<tr>${tds.join('')}</tr>`);
    });

    const thead = (includeHeader && headers.length)
        ? `<thead><tr>${headers.map(h => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>`
        : '';

    // Minimales, eigenständiges HTML-Table zurückgeben
    return `<table>${thead}<tbody>${bodyRows.join('')}</tbody></table>`;
}

// --- NEW: Zell-HTML ohne Expand-Button (falls vorhanden) ---
function getCellInnerHTMLWithoutExpandButton(td) {
    const clone = td.cloneNode(true);
    // Wenn erstes Child ein Button ist (Expand-Button), entfernen
    if (clone.firstChild &&
        clone.firstChild.nodeType === Node.ELEMENT_NODE &&
        clone.firstChild.tagName === 'BUTTON') {
        clone.removeChild(clone.firstChild);
    }
    return clone.innerHTML.trim();
}

// --- NEW: HTML-Datei herunterladen ---
function downloadHTML(html, filename = "table_export.html") {
    const blob = new Blob([html], { type: "text/html;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
}

// --- Utils: HTML escapen / HTML zu Text ---
function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}
function stripHtml(html) {
    const div = document.createElement('div');
    div.innerHTML = html;
    return (div.textContent || div.innerText || '').trim();
}

// --- NEW: Sichtbare Tabelle als "Styled HTML" (mit Inline-CSS) exportieren ---
// Optionen:
// - standalone: true => vollständiges HTML-Dokument mit <html><head>...<body>
//               false => nur das <table>-Fragment (z.B. für Clipboard "text/html")
// - preserveBackground: Dark-Theme-Hintergrund (body/#tableWrapper) übernehmen
async function buildStyledHTML({ standalone = false, preserveBackground = true } = {}) {
    const target = getCaptureTarget(); // #tableWrapper bevorzugt, sonst #mainTable
    if (!target) throw new Error("Kein Tabellen-Container (#tableWrapper/#mainTable) gefunden.");

    // 1) Sichtbaren Bereich klonen und Styles inline anheften
    const rootClone = cloneWithInlineStyles(target);

    // 2) Aufräumen (UI/Controls entfernen, nur sichtbare Spalten/Zeilen behalten)
    pruneForTableExport(rootClone);

    // 3) Hintergrund und max-Width/Overflow sicherstellen
    if (preserveBackground) {
        const bg = (document.body && window.getComputedStyle(document.body).backgroundColor) || 'rgb(33, 44, 68)';
        rootClone.style.background = bg;
        rootClone.style.overflow = 'visible';
        rootClone.style.maxWidth = 'none';
        rootClone.style.maxHeight = 'none';
    }

    // 4) Table-Element extrahieren (im Wrapper) oder ganzes Konstrukt verwenden
    const exportedTable = rootClone.querySelector('#mainTable') || rootClone.querySelector('table') || rootClone;

    // 5) Fragment (nur <table>…) oder vollständiges HTML-Dokument erzeugen
    const fragmentHTML = exportedTable.outerHTML;

    if (!standalone) {
        // Nur das Fragment (für Clipboard)
        return fragmentHTML;
    }

    // Vollständiges HTML (Download)
    const docLang = document.documentElement.lang || 'en';
    const metaBg = preserveBackground
        ? `body{background:${(document.body && window.getComputedStyle(document.body).backgroundColor) || '#212c44'};}`
        : '';

    const full = [
        '<!doctype html>',
        `<html lang="${docLang}">`,
        '<head>',
        '<meta charset="utf-8">',
        '<meta name="viewport" content="width=device-width,initial-scale=1">',
        // Kein externes CSS — alle Stile sind inline. Eine minimale Safety-Reset-Regel:
        `<style>table{border-collapse:collapse} th,td{border:1px solid rgba(255,255,255,0.08); padding:4px 6px} ${metaBg}</style>`,
        '<title>table_export</title>',
        '</head>',
        '<body>',
        fragmentHTML,
        '</body>',
        '</html>'
    ].join('');
    return full;
}

// --- NEW: Klon für Export bereinigen ---
// Entfernt UI-Steuerelemente/Dropdowns u. ä. und lässt nur sichtbare Spalten/Zeilen stehen
// --- NEU/GEÄNDERT ---
function pruneForTableExport(root, { interactive = false } = {}) {
  // 1) UI-Container nur entfernen, wenn NICHT interaktiv exportiert wird
  const removableAlways = [
    '#recordWrapper' // die Zahl-Anzeige ist optional – kannst du auch drin lassen
  ];
  const removableIfStatic = [
    '#copyContainer',
    '#copyDropdown',
    '#columnVisibilityWrapper',
    '.dropdownParent',
    '.dropdown',
    '.functionBar',
    '.filterIconContainer',
    '.resizeArea',
    '.sortIcon'
  ];

  [...removableAlways, ...(interactive ? [] : removableIfStatic)]
    .forEach(sel => root.querySelectorAll(sel).forEach(n => n.remove()));

  // 2) Expand-Buttons in Zellen nur entfernen, wenn NICHT interaktiv
  if (!interactive) {
    root.querySelectorAll('td, th').forEach(td => {
      if (td.firstElementChild && td.firstElementChild.tagName === 'BUTTON') {
        td.removeChild(td.firstElementChild);
      }
    });
  }

  // 3) Sichtbarkeiten/Spalten trimmen wie gehabt
  const visibleHeaderIdx = [];
  const origHeaderCells = document.querySelectorAll('#tableHeaderRow > th');
  origHeaderCells.forEach((th, idx) => {
    const visible = th.offsetParent !== null && th.offsetWidth > 0 && th.offsetHeight > 0;
    if (visible) visibleHeaderIdx.push(idx);
  });

  const clonedHeaderRow = root.querySelector('#tableHeaderRow');
  if (clonedHeaderRow) {
    Array.from(clonedHeaderRow.children).forEach((th, idx) => {
      if (!visibleHeaderIdx.includes(idx)) th.remove();
    });
  }

  root.querySelectorAll('tr.mainTr').forEach((tr, rowIndex) => {
    const origRow = document.querySelectorAll('tr.mainTr')[rowIndex];
    const rowVisible = origRow && (origRow.offsetParent !== null) && (origRow.offsetWidth > 0) && (origRow.offsetHeight > 0);
    if (!rowVisible) {
      tr.remove();
      return;
    }
    const cells = Array.from(tr.children);
    cells.forEach((td, idx) => {
      if (!visibleHeaderIdx.includes(idx)) td.remove();
    });
  });

  // 4) Expansionen nur entfernen, wenn NICHT interaktiv
  if (!interactive) {
    root.querySelectorAll('tr.expansionWindow, .childExpansion').forEach(n => n.remove());
  }

  // 5) Breiten fixieren wie gehabt
  const table = root.querySelector('#mainTable');
  if (table) {
    table.style.width = (document.getElementById('mainTable')?.offsetWidth || table.offsetWidth) + 'px';
    table.style.maxWidth = 'none';
    table.style.minWidth = '0';
  }

  const origRows = document.querySelectorAll('#mainTable tr');
  const clonedRows = root.querySelectorAll('#mainTable tr');
  for (let r = 0; r < Math.min(origRows.length, clonedRows.length); r++) {
    const oCells = origRows[r].children;
    const cCells = clonedRows[r].children;
    for (let c = 0; c < Math.min(oCells.length, cCells.length); c++) {
      const ow = oCells[c].offsetWidth;
      if (ow > 0) {
        cCells[c].style.width = ow + 'px';
        cCells[c].style.minWidth = ow + 'px';
        cCells[c].style.maxWidth = ow + 'px';
        cCells[c].style.whiteSpace = 'nowrap';
        const ocs = window.getComputedStyle(oCells[c]);
        if (ocs.textOverflow) cCells[c].style.textOverflow = ocs.textOverflow;
        if (ocs.overflow)     cCells[c].style.overflow     = ocs.overflow;
      }
    }
  }
}

// --- NEW: HTML mit Inline-CSS in Clipboard (text/html) ---
async function copyStyledHTMLToClipboard() {
    const html = await buildStyledHTML({ standalone: false, preserveBackground: true });
    if (navigator.clipboard && window.ClipboardItem) {
        const item = new ClipboardItem({
            'text/html': new Blob([html], { type: 'text/html' }),
            // Plaintext-Fallback, falls Zielapp das braucht
            'text/plain': new Blob([stripHtml(html)], { type: 'text/plain' })
        });
        await navigator.clipboard.write([item]);
        alert('HTML (mit CSS) kopiert!');
    } else {
        // Fallback über contenteditable
        const div = document.createElement('div');
        div.contentEditable = 'true';
        div.style.position = 'fixed';
        div.style.opacity = '0';
        div.style.left = '-9999px';
        div.innerHTML = html;
        document.body.appendChild(div);
        const range = document.createRange();
        range.selectNodeContents(div);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        document.execCommand('copy');
        document.body.removeChild(div);
        alert('HTML (mit CSS) kopiert (Fallback)!');
    }
}

// --- NEW: Download als eigenständige .html (mit Inline-CSS + optional JS) ---
async function downloadStyledHTML(filename = 'table_export.html') {
  const fullHtml = await buildHTMLWithEmbeddedCSS({
    standalone: true,
    preserveBackground: true,
    includeJS: 'inline'   // <--- NEU: ganze Datei offline lauffähig
  });
  const blob = new Blob([fullHtml], { type: 'text/html;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// --- NEW: Stylesheet-Inhalte einsammeln (nur same-origin) ---
function collectCSSFromDocument() {
    let cssText = "";

    for (const sheet of Array.from(document.styleSheets)) {
        try {
            // Zugriff kann SecurityError werfen (CORS, cross-origin)
            const rules = sheet.cssRules || [];
            for (const rule of Array.from(rules)) {
                cssText += rule.cssText + "\n";
            }
        } catch (e) {
            // Fallback: versuchen per fetch, wenn Link-URL same-origin ist
            const owner = sheet.ownerNode;
            if (owner && owner.tagName === 'LINK' && owner.href) {
                try {
                    const url = new URL(owner.href, location.href);
                    const sameOrigin = url.origin === location.origin;
                    if (sameOrigin) {
                        // Achtung: fetch kann bei manchen CSPs blocken
                        // Wir nutzen den synchronen Weg unten NICHT, nur optionalen async Fetch im Aufrufer.
                        // Hier nur Marker setzen; eigentlicher Fetch passiert in build*().
                        cssText += `/*__FETCH_CSS__:${url.href}*/\n`;
                    } else {
                        console.warn('Stylesheet ist cross-origin, wird ausgelassen:', owner.href);
                    }
                } catch (err) {
                    console.warn('Konnte Stylesheet-URL nicht parsen:', err);
                }
            } else {
                console.warn('Stylesheet ohne zugreifbare cssRules ausgelassen (vermutlich cross-origin).');
            }
        }
    }
    return cssText;
}

// Lädt den Text einer externen Ressource (für Inline-Bundle)
async function getExternalText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not fetch ${url}: ${res.status}`);
  return await res.text();
}

/**
 * Erzeugt JS-Bundle:
 *   mode: 'inline' | 'cdn' | 'none'
 *   - 'inline' => jQuery + tablesorter werden in <script> inline eingebettet (offline-fähig)
 *   - 'cdn'    => <script src="..."> Verweise (kleine Datei, Internet erforderlich)
 *   - 'none'   => kein JS
 *
 * Fallback: Falls 'inline' nicht fetchen darf/kann (CSP/offline),
 *           wird automatisch auf 'cdn' zurückgefallen.
 */
async function buildJsBundle(mode = 'inline') {
  const INIT = (
    '<script>document.addEventListener("DOMContentLoaded",function(){' +
      'try{' +
        'var t=document.querySelector("table");' +
        'if(t && window.jQuery && typeof jQuery(t).tablesorter==="function"){' +
          'jQuery(t).tablesorter({sortReset:true});' +
        '}' +
      '}catch(e){console.warn("tablesorter init failed:",e);}' +
    '});</script>'
  );

  const CDN_TAGS =
    '<script src="https://code.jquery.com/jquery-3.6.1.min.js" crossorigin="anonymous"></script>\n' +
    '<script src="https://cdnjs.cloudflare.com/ajax/libs/jquery.tablesorter/2.31.3/js/jquery.tablesorter.min.js" crossorigin="anonymous"></script>\n' +
    INIT;

  if (mode === 'none') return '';

  if (mode === 'cdn') {
    return CDN_TAGS;
  }

  // Default: inline
  try {
    const [jq, ts] = await Promise.all([
      getExternalText('https://code.jquery.com/jquery-3.6.1.min.js'),
      getExternalText('https://cdnjs.cloudflare.com/ajax/libs/jquery.tablesorter/2.31.3/js/jquery.tablesorter.min.js')
    ]);

    return (
      '<script>\n' + jq + '\n</script>\n' +
      '<script>\n' + ts + '\n</script>\n' +
      INIT
    );
  } catch (e) {
    console.warn('Inline-JS konnte nicht eingebettet werden (CSP/Offline?) – fallback auf CDN:', e);
    return CDN_TAGS; // immer noch funktionsfähig, sobald Internet vorhanden
  }
}

// --- NEW: Ersetze Marker durch tatsächlich gefetchtes CSS (nur same-origin) ---
async function resolveFetchCssMarkers(cssTextWithMarkers) {
    const markerRe = /\/\*__FETCH_CSS__:(.*?)\*\//g;
    let out = cssTextWithMarkers;
    const promises = [];
    const urls = [];

    let m;
    while ((m = markerRe.exec(cssTextWithMarkers)) !== null) {
        urls.push(m[1]);
        promises.push(fetch(m[1]).then(r => r.text()).catch(() => '/* fetch failed */'));
    }

    const results = await Promise.all(promises);
    results.forEach((css, idx) => {
        out = out.replace(`/*__FETCH_CSS__:${urls[idx]}*/`, css);
    });
    return out;
}

// Vorhanden aus deiner Lösung:
/// cloneWithInlineStyles(node)
/// getCaptureTarget()
/// computeVerticalSlices / ensureScaleWithinLimits (für Bilder)
// ... etc.

// --- NEW: Export mit eingebettetem Stylesheet + Inline-Styles ---
// --- Export mit eingebettetem Stylesheet + Inline-Styles + optional JS ---
// --- Export mit eingebettetem Stylesheet + Inline-Styles + optional JS ---
// --- GEÄNDERT ---
async function buildHTMLWithEmbeddedCSS({
  standalone = false,
  preserveBackground = true,
  includeJS = 'none',   // 'inline' | 'cdn' | 'none'
  interactive = false   // <--- NEU: interaktive UI behalten & bootstrap einbetten
} = {}) {
  const target = getCaptureTarget();
  if (!target) throw new Error("Kein Tabellen-Container (#tableWrapper/#mainTable) gefunden.");

  // 1) Sichtbaren Bereich klonen und Computed Styles inline übernehmen
  const rootClone = cloneWithInlineStyles(target);

  // 2) Aufräumen (nur sichtbare Spalten/Zeilen; UI je nach Modus behalten/entfernen)
  pruneForTableExport(rootClone, { interactive });

  // 3) Optional Hintergrund übernehmen
  if (preserveBackground) {
    const bodyBg = (document.body && getComputedStyle(document.body).backgroundColor) || '#ffffff';
    rootClone.style.background = bodyBg;
    rootClone.style.overflow = 'visible';
    rootClone.style.maxWidth = 'none';
    rootClone.style.maxHeight = 'none';
  }

  // 4) Tabelle finden
  const exportedTable = rootClone.querySelector('#mainTable') || rootClone.querySelector('table') || rootClone;

  // 5) CSS einsammeln & Reset
  let docCss = collectCSSFromDocument();
  docCss = await resolveFetchCssMarkers(docCss);
  const minimalReset = `
    table{border-collapse:collapse}
    th,td{border:1px solid rgba(255,255,255,0.08); padding:4px 6px}
  `;

  const fragmentHTML = exportedTable.outerHTML;

  if (!standalone) {
    // Clipboard-Pfad: KEIN JS (wird ohnehin oft gestript)
    return `<style>${docCss}\n${minimalReset}</style>\n${fragmentHTML}`;
  }

  // 6) jQuery/tablesorter-Bundle
  const libJs = await buildJsBundle(includeJS); // 'inline' für offline, s.u.

  // 7) Deine Runtime nur einbetten, wenn interaktiv
  const appJs = interactive ? buildAppRuntimeInlineScript() : '';

  const docLang = document.documentElement.lang || 'de';
  const full = [
    '<!doctype html>',
    `<html lang="${docLang}">`,
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    `<style>${docCss}\n${minimalReset}</style>`,
    '<title>table_export</title>',
    '</head>',
    '<body>',
    fragmentHTML,
    libJs,   // jQuery + tablesorter (+ Init)
    appJs,   // <--- DEINE Runtime (Expand/Copy/…)
    '</body>',
    '</html>'
  ].join('');
  return full;
}

// --- ServiceNow friendly constants ---
const SN_MIN_TABLE_STYLE = "border-collapse:collapse;width:100%;";
const SN_MIN_TH_STYLE    = "border:1px solid rgba(0,0,0,0.3);padding:4px 6px;text-align:left;font-weight:600;";
const SN_MIN_TD_STYLE    = "border:1px solid rgba(0,0,0,0.2);padding:4px 6px;text-align:left;";

// Entfernt Style/Script/Link und riskante Attribute (SN-Sanitizer-freundlich)
function sanitizeHtmlForServiceNow(htmlString) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlString, "text/html");

  // Entferne style/script/link
  doc.querySelectorAll("style,script,link").forEach(n => n.remove());

  // Entferne Style/Klasse/ID/Eventhandler
  const stripAttrs = ["style", "class", "id"];
  doc.querySelectorAll("*").forEach(el => {
    // Eventhandler (on*)
    [...el.attributes].forEach(a => {
      const name = a.name.toLowerCase();
      if (name.startsWith("on")) el.removeAttribute(a.name);
    });
    stripAttrs.forEach(a => el.removeAttribute(a));
  });

  // Nur die erste <table> behalten (SN-Felder sind knapp); andernfalls kompletten Body zurückgeben
  const table = doc.querySelector("table");
  if (table) {
    // Wende Minimal-Styles an
    table.setAttribute("style", SN_MIN_TABLE_STYLE);
    table.querySelectorAll("th").forEach(th => th.setAttribute("style", SN_MIN_TH_STYLE));
    table.querySelectorAll("td").forEach(td => td.setAttribute("style", SN_MIN_TD_STYLE));
    return table.outerHTML;
  } else {
    return doc.body.innerText || ""; // Fallback: Plaintext
  }
}

// --- NEU: packt die benötigten Funktionen/Konstanten als inline <script> ---
function buildAppRuntimeInlineScript() {
  // Konstanten, die in Funktionen referenziert werden
  const constants = `
    const TOGGLE_ANIMATION_MS = ${typeof TOGGLE_ANIMATION_MS !== 'undefined' ? TOGGLE_ANIMATION_MS : 200};
    const FUNCTION_BAR_OFFSET = ${typeof FUNCTION_BAR_OFFSET !== 'undefined' ? FUNCTION_BAR_OFFSET : 40};
    const HEADER_TEXT_WIDTH_RATIO = ${typeof HEADER_TEXT_WIDTH_RATIO !== 'undefined' ? HEADER_TEXT_WIDTH_RATIO : (4/5)};
    const BASE_INDENT = ${typeof BASE_INDENT !== 'undefined' ? BASE_INDENT : 50};
    const BASE_INDENT_OFFSET = ${typeof BASE_INDENT_OFFSET !== 'undefined' ? BASE_INDENT_OFFSET : 25};
  `;

  // 🔴 WICHTIG: Alle Funktionen, die für Expand/Copy/Filter/Resize benötigt werden
  // (inkl. der jetzt fehlenden addJsonExpansionEvent, getChildExpansion, expandJson)
  const requiredFns = [
    // Expand Hauptlogik
    
    applyRowColorStyling,
    applyRowStyling,
    buttonIsExpanded,
    changeExpandButtonIcon,
    createRowExpandButton,
    addExpandButtonEventListeners,
    expandRow,
    addNestedEntry,
    addExpandedRowEntry,
    extractTextFromChildNodes,
    getColumnNames,
    prepareExpandTable,
    removeAllExpandWindows,

    // JSON-Expand inkl. fehlender Funktionen
    prepareJsonExpansion,
    addJsonExpansionEvent,   // <--- vorher fehlend
    getChildExpansion,       // <--- vorher fehlend
    expandJson,              // <--- vorher fehlend
    tryGetJSON,

    // Dropdowns / Filter / Sort-Icon / Resize
    setupDropdownMenus,
    hideDropdowns,
    setupDropdownClosing,
    setupFiltering,
    toggleFilter,
    resetFilterAfterModeChange,
    setupSortIconDisplay,
    setupColumnResizing,
    correctFunctionBarPosition,
    correctHeaderTextWidth,
    resizeColumn,

    // Capture/Export Utils, die im Copy-Menü genutzt werden
    getCaptureTarget,
    cloneWithInlineStyles,
    ensureScaleWithinLimits,
    computeVerticalSlices,
    elementToImageBlobsTiled,
    downloadImageBlobs,
    copyFirstBlobToClipboard,

    // Copy-Varianten
    extractTableAsText,
    extractTableAsCSV,
    downloadCSV,
    stripHtml,

    // Copy-Dropdown Handler
    setupCopyDropdown
  ];

  const fnText = requiredFns
    .filter(fn => typeof fn === 'function')
    .map(fn => fn.toString())
    .join('\n\n');

  // Bootstrap: Event-Handler im exportierten Dokument neu anbinden
  const bootstrap = `
    function __exportBootstrap() {
      try { setupDropdownMenus(); } catch(e) { console.warn('dropdown menus failed', e); }
      try { setupCopyDropdown(); } catch(e) { console.warn('copy dropdown failed', e); }
      try { addExpandButtonEventListeners(false); } catch(e) { console.warn('expand listeners failed', e); }
      try { prepareJsonExpansion(); } catch(e) { console.warn('json expansion prepare failed', e); }
      try { setupFiltering(); } catch(e) { console.warn('filter setup failed', e); }
      try { setupColumnResizing(); } catch(e) { console.warn('resize setup failed', e); }
      try { setupSortIconDisplay(); } catch(e) { console.warn('sort icon setup failed', e); }
    }
    document.addEventListener('DOMContentLoaded', __exportBootstrap);
  `;

  return `<script>(function(){\n${constants}\n${fnText}\n${bootstrap}\n})();</script>`;
}

// Baut eine einfache <table> aus deinem Grid (tr.mainTr + td.dataTd[data-column])
function buildServiceNowTableFromGrid({ maxColWidth = null } = {}) {
  // 1) Alle Zeilen finden
  const rows = [...document.querySelectorAll("tr.mainTr")];
  if (rows.length === 0) return "";

  // 2) Header ableiten aus data-column
  const colOrder = [];
  const colSet = new Set();
  rows.forEach(tr => {
    tr.querySelectorAll("td").forEach(td => {
      const col = td.getAttribute("data-column");
      if (col && !colSet.has(col)) {
        colSet.add(col);
        colOrder.push(col);
      }
    });
  });

  // Fallback, wenn keine data-column vorhanden
  if (colOrder.length === 0) {
    const maxCells = Math.max(
      ...rows.map(tr => tr.querySelectorAll("td").length)
    );
    for (let i = 0; i < maxCells; i++) {
      colOrder.push(`COL_${i + 1}`);
    }
  }

  const truncate = (text) => {
    if (!maxColWidth || maxColWidth <= 0) return text ?? "";
    const t = (text ?? "").toString();
    return t.length <= maxColWidth ? t : t.slice(0, maxColWidth - 1) + "…";
  };

  // 3) HTML erstellen (nur Table/Thead/Tbody/Tr/Th/Td)
  const table = document.createElement("table");
  table.setAttribute("style", SN_MIN_TABLE_STYLE);

  // thead
  const thead = document.createElement("thead");
  const trHead = document.createElement("tr");
  colOrder.forEach(h => {
    const th = document.createElement("th");
    th.setAttribute("style", SN_MIN_TH_STYLE);
    th.textContent = truncate(h);
    trHead.appendChild(th);
  });
  thead.appendChild(trHead);
  table.appendChild(thead);

  // tbody
  const tbody = document.createElement("tbody");
  rows.forEach(tr => {
    const map = {};
    tr.querySelectorAll("td").forEach(td => {
      const key = td.getAttribute("data-column");
      const val = td.innerText.trim();
      if (key) map[key] = val;
    });

    const trBody = document.createElement("tr");
    colOrder.forEach(col => {
      const td = document.createElement("td");
      td.setAttribute("style", SN_MIN_TD_STYLE);
      td.textContent = truncate(map[col] ?? "");
      trBody.appendChild(td);
    });
    tbody.appendChild(trBody);
  });
  table.appendChild(tbody);

  return table.outerHTML;
}

// Extrahiert vorhandene <table> (falls du bereits eine echte Tabelle renderst)
function getFirstTableHtmlOrEmpty() {
  const t = document.querySelector("table");
  return t ? t.outerHTML : "";
}

// Plaintext-Ausgabe (Tab-getrennt), gut für Activity-Kommentare
function buildPlaintextFromGrid({ maxColWidth = null, sep = "\t" } = {}) {
  const rows = [...document.querySelectorAll("tr.mainTr")];
  if (rows.length === 0) return "";

  const colOrder = [];
  const colSet = new Set();
  rows.forEach(tr => {
    tr.querySelectorAll("td").forEach(td => {
      const col = td.getAttribute("data-column");
      if (col && !colSet.has(col)) {
        colSet.add(col);
        colOrder.push(col);
      }
    });
  });

  if (colOrder.length === 0) {
    const maxCells = Math.max(...rows.map(tr => tr.querySelectorAll("td").length));
    for (let i = 0; i < maxCells; i++) colOrder.push(`COL_${i + 1}`);
  }

  const truncate = (text) => {
    if (!maxColWidth || maxColWidth <= 0) return text ?? "";
    const t = (text ?? "").toString();
    return t.length <= maxColWidth ? t : t.slice(0, maxColWidth - 1) + "…";
    };

  const lines = [];
  lines.push(colOrder.join(sep));

  rows.forEach(tr => {
    const map = {};
    tr.querySelectorAll("td").forEach(td => {
      const key = td.getAttribute("data-column");
      const val = td.innerText.trim();
      if (key) map[key] = val;
    });
    const cells = colOrder.map(c => truncate(map[c] ?? ""));
    lines.push(cells.join(sep));
  });

  return lines.join("\n");
}

async function copyToClipboard(textOrHtml, { asHtml = false } = {}) {
  if (navigator.clipboard && window.ClipboardItem && asHtml) {
    // HTML in Clipboard (wo unterstützt)
    const blob = new Blob([textOrHtml], { type: "text/html" });
    const item = new ClipboardItem({ "text/html": blob });
    await navigator.clipboard.write([item]);
  } else {
    // Fallback: Text
    await navigator.clipboard.writeText(textOrHtml);
  }
}

// Lädt Text einer URL (für Inline-Bundle)
async function getExternalText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not fetch ${url}: ${res.status}`);
  return await res.text();
}

/**
 * Erzeugt JS-Bundle:
 *   mode: 'inline' | 'cdn' | 'none'
 *   - 'inline' => jQuery + tablesorter werden in <script> inline eingebettet (offline-fähig)
 *   - 'cdn'    => <script src="..."> Verweise (kleinere Datei, benötigt Internet)
 *   - 'none'   => kein JS (aktuelles Verhalten)
 */
async function buildJsBundle(mode = 'inline') {
  if (mode === 'none') return '';

  if (mode === 'cdn') {
    return [
      '<script src="https://code.jquery.com/jquery-3.6.1.min.js" crossorigin="anonymous"></script>',
      '<script src="https://cdnjs.cloudflare.com/ajax/libs/jquery.tablesorter/2.31.3/js/jquery.tablesorter.min.js"></script>',
      '<script>document.addEventListener("DOMContentLoaded",function(){try{var t=document.querySelector("table");if(t&&window.jQuery&&typeof jQuery(t).tablesorter==="function"){jQuery(t).tablesorter({sortReset:true});}}catch(e){console.warn("tablesorter init failed:",e);}});</script>'
    ].join('\n');
  }

  // Default: inline (offline)
  const [jq, ts] = await Promise.all([
    getExternalText('https://code.jquery.com/jquery-3.6.1.min.js'),
    getExternalText('https://cdnjs.cloudflare.com/ajax/libs/jquery.tablesorter/2.31.3/js/jquery.tablesorter.min.js')
  ]);

  return [
    '<script>\n' + jq + '\n</script>',
    '<script>\n' + ts + '\n</script>',
    '<script>document.addEventListener("DOMContentLoaded",function(){try{var t=document.querySelector("table");if(t&&window.jQuery&&typeof jQuery(t).tablesorter==="function"){jQuery(t).tablesorter({sortReset:true});}}catch(e){console.warn("tablesorter init failed:",e);}});</script>'
  ].join('\n');
}

function cloneWithInlineStyles(node) {
    const clone = node.cloneNode(false);
    if (node.nodeType === Node.ELEMENT_NODE) {
        const computed = window.getComputedStyle(node);
        const cssText = Array.from(computed).map(k => `${k}:${computed.getPropertyValue(k)};`).join('');
        clone.setAttribute('style', cssText);
        // WICHTIG: Scroll-Container im Klon „öffnen“
        clone.style.overflow = 'visible';
        clone.style.maxHeight = 'none';
        clone.style.maxWidth  = 'none';
    }
    for (const child of node.childNodes) clone.appendChild(cloneWithInlineStyles(child));
    return clone;
}

async function elementToImageBlobsTiled(element, {
    mimeType = 'image/png',
    quality  = 0.92,
    scale    = 2
} = {}) {
    // Zielbreite/-höhe der GANZEN Tabelle bestimmen
    const tableEl = document.getElementById('mainTable') || element;
    const fullWidth  = Math.max(element.scrollWidth,  tableEl.scrollWidth,  element.offsetWidth);
    const fullHeight = Math.max(element.scrollHeight, tableEl.scrollHeight, element.offsetHeight);

    if (!fullWidth || !fullHeight)
        throw new Error('elementToImageBlobsTiled: target has zero size');

    // Scale begrenzen
    const safeScale = ensureScaleWithinLimits(fullWidth, fullHeight, scale);

    // Vertikale Slices berechnen
    const slices = computeVerticalSlices(fullHeight, safeScale);
    const blobs  = [];

    for (const { offset, height } of slices) {
        const cloned = cloneWithInlineStyles(element);
        // Scroll/Clip im Klon vollständig aufheben
        cloned.style.width     = fullWidth + 'px';
        cloned.style.height    = fullHeight + 'px';
        cloned.style.overflow  = 'visible';
        cloned.style.maxHeight = 'none';
        cloned.style.maxWidth  = 'none';
        // Verschiebe den Inhalt nach oben, sodass der Slice (offset..offset+height) sichtbar ist
        cloned.style.transform = `translateY(-${offset}px)`;

        const wrapper = document.createElement('div');
        wrapper.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
        wrapper.style.width  = fullWidth + 'px';
        wrapper.style.height = height + 'px';
        // Hintergrundfarbe (Dark-Theme):
        wrapper.style.background = document.body.style.backgroundColor || 'rgb(33, 44, 68)';
        wrapper.appendChild(cloned);

        const svg =
`<svg xmlns="http://www.w3.org/2000/svg"
     width="${Math.round(fullWidth*safeScale)}"
     height="${Math.round(height*safeScale)}"
     viewBox="0 0 ${fullWidth} ${height}">
  <foreignObject width="100%" height="100%">${new XMLSerializer().serializeToString(wrapper)}</foreignObject>
</svg>`;

        const img = await new Promise((resolve, reject) => {
            const image = new Image();
            image.decoding = 'async';
            image.onload = () => resolve(image);
            image.onerror = reject;
            image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
        });

        const canvas = document.createElement('canvas');
        canvas.width  = Math.round(fullWidth  * safeScale);
        canvas.height = Math.round(height     * safeScale);
        const ctx = canvas.getContext('2d');
        if (mimeType === 'image/jpeg') {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        const blob = await new Promise((resolve, reject) => {
            canvas.toBlob(b => b ? resolve(b) : reject(new Error('toBlob returned null')), mimeType, quality);
        });

        blobs.push(blob);
    }

    return { blobs, scale: safeScale };
}

function downloadImageBlobs(blobs, baseName, ext="png") {
    blobs.forEach((blob, idx) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        // _part_01, _part_02, ...
        const num = String(idx + 1).padStart(2, '0');
        a.href = url; a.download = `${baseName}_part_${num}.${ext}`;
        a.click();
        URL.revokeObjectURL(url);
    });
}

async function copyFirstBlobToClipboard(blobs) {
    if (!blobs.length) return;
    if (navigator.clipboard && window.ClipboardItem) {
        const item = new ClipboardItem({ [blobs[0].type]: blobs[0] });
        await navigator.clipboard.write([item]);
    } else {
        throw new Error('Clipboard image copy not supported in this browser');
    }
}

// Konservative Browser-Limits:
const MAX_CANVAS_SIDE  = 16384;           // harte Seitenlänge
const MAX_CANVAS_AREA  = 268435456;       // ~268 Mio Pixel (16k x 16k)

// Passt den Scale so an, dass width*scale und height*scale die Limits einhalten
function ensureScaleWithinLimits(width, height, scale) {
    // Seite begrenzen
    const scaleSide = Math.min(MAX_CANVAS_SIDE / Math.max(1, width),
                               MAX_CANVAS_SIDE / Math.max(1, height));
    // Fläche begrenzen
    const scaleArea = Math.sqrt(MAX_CANVAS_AREA / Math.max(1, width * height));
    // Effektiven Scale wählen (<= ursprünglicher scale)
    return Math.min(scale, scaleSide, scaleArea);
}

// Liefert Offsets/Höhen für vertikale Slices, sodass (sliceHeight*scale) <= MAX_CANVAS_SIDE bleibt
function computeVerticalSlices(totalHeight, scale) {
    const MAX_SLICE_RENDERED = Math.floor(MAX_CANVAS_SIDE / Math.max(1, scale));
    const slices = [];
    let offset = 0;
    while (offset < totalHeight) {
        const remaining = totalHeight - offset;
        const h = Math.min(remaining, MAX_SLICE_RENDERED);
        slices.push({ offset, height: h });
        offset += h;
    }
    return slices;
}

function getCaptureTarget() {
    // Bevorzugt der Wrapper, sonst direkt die Tabelle
    return document.getElementById('tableWrapper')
        || document.getElementById('mainTable')
        || null;
}

function setupCopyDropdown() {
    const btn  = document.getElementById("copyDropdownBtn");
    const menu = document.getElementById("copyDropdown");
    if (!btn || !menu) return;

    // Dropdown öffnen/schließen
    btn.addEventListener("click", (e) => {
        e.stopPropagation();
        menu.style.display = (menu.style.display === "none" || !menu.style.display) ? "block" : "none";
    });

    // Optionen bedienen
    document.querySelectorAll("#copyDropdown .copyOption").forEach(opt => {
        opt.addEventListener("click", async () => {
            try {
                const mode   = opt.getAttribute("data-copy");
                const target = getCaptureTarget();               // <-- WICHTIG: hier definieren!
                if (!target) {
                    console.error("No capture target (#tableWrapper/#mainTable) found");
                    alert("Kein Tabellen-Container gefunden (#tableWrapper/#mainTable).");
                    return;
                }

                switch (mode) {
                    case "text":
                        await copyToClipboard(extractTableAsText());
                        break;

                    case "csv":
                        await copyToClipboard(extractTableAsCSV());
                        break;

                    case "download csv":
                        downloadCSV(extractTableAsCSV());
                        break;
                    
                    
                    case "html": {
                        const html = await buildHTMLWithEmbeddedCSS({ standalone: false, preserveBackground: true });
                        // direkt als text/html ins Clipboard
                        if (navigator.clipboard && window.ClipboardItem) {
                            const item = new ClipboardItem({
                                'text/html': new Blob([html], { type: 'text/html' }),
                                'text/plain': new Blob([stripHtml(html)], { type: 'text/plain' })
                            });
                            await navigator.clipboard.write([item]);
                            alert('HTML (inkl. CSS) kopiert!');
                        } else {
                            // Fallback
                            const div = document.createElement('div');
                            div.contentEditable = 'true';
                            div.style.position = 'fixed';
                            div.style.opacity = '0';
                            div.style.left = '-9999px';
                            div.innerHTML = html;
                            document.body.appendChild(div);
                            const range = document.createRange();
                            range.selectNodeContents(div);
                            const sel = window.getSelection();
                            sel.removeAllRanges();
                            sel.addRange(range);
                            document.execCommand('copy');
                            document.body.removeChild(div);
                            alert('HTML (inkl. CSS) kopiert (Fallback)!');
                        }
                        break;
                    }

                    case "download html": {
                      const fullHtml = await buildHTMLWithEmbeddedCSS({
                        standalone: true,
                        preserveBackground: true,
                        includeJS: 'inline',  // offline-fähig
                        interactive: true     // UI/Buttons behalten + Runtime einbetten
                      });
                      const blob = new Blob([fullHtml], { type: "text/html;charset=utf-8" });
                      const url  = URL.createObjectURL(blob);
                      const a    = document.createElement("a");
                      a.href = url; a.download = "table_export.html"; a.click();
                      URL.revokeObjectURL(url);
                      break;
                    }

                    /* ---------------- FULL TABLE EXPORTS ---------------- */
                    
                    case "png-full": {
                        const { blobs } = await elementToImageBlobsTiled(target, {
                            mimeType: "image/png",
                            scale: 2
                        });
                        await copyFirstBlobToClipboard(blobs);
                        alert(blobs.length > 1
                            ? `Bild (Slice 1/${blobs.length}) in Zwischenablage.`
                            : `Bild kopiert.`);
                        break;
                    }
                
                    case "download png full": {
                        const { blobs } = await elementToImageBlobsTiled(target, {
                            mimeType: "image/png",
                            scale: 2
                        });
  
                        downloadImageBlobs(blobs, "table_export_full", "png");
                        break;
                    }
                
                    case "download jpg full": {
                        const { blobs } = await elementToImageBlobsTiled(target, {
                            mimeType: "image/jpeg",
                            scale: 2
                        });
                        downloadImageBlobs(blobs, "table_export_full", "jpg");
                        break;
                    }
                
                    default:
                        console.warn("Unknown copy mode:", mode);
                }

            } catch (e) {
                console.error('Copy/Export failed:', e);
                alert('Bild-/Daten-Export fehlgeschlagen (siehe Konsole).');
            } finally {
                // Menü schließen
                menu.style.display = "none";
                // Für die .open-Variante:
                // menu.classList.remove('open');
            }
        });
    });

    // Klick außerhalb schließt Dropdown
    document.addEventListener("click", () => { menu.style.display = "none"; /* menu.classList.remove('open'); */ });
}