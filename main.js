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
const HEADER_TEXT_WIDTH_RATIO = 4/5; // Ratio in relation to function bar width
const TOGGLE_ANIMATION_MS = 200;

// TODO: find way to make these pseudo-constants run after document.ready() but be globally available
var ROWS;
var COLUMN_NAMES;
var NUM_COLUMNS;

function createTable(tableData) {
    createStaticTableElements();
    addTableData(tableData);

    initializeConstants();
    setupTableHeaders();
    applyRowStyling();
    setupRowExpansion();
    setupRecordsDisplay();
    setupTableElementsAndSorting();
    setupSortIconDisplay();
    setupDropdownMenu();
    setupDropdownMenuOutOfScopeClosing();
    setupFiltering();
    setupInitialFunctionBarPosition();
    setupColumnWidth(NUM_COLUMNS);
    setupColumnResizing();
    initializeColumnFilters();
    addColumnFilterButtonEventListener();
    addSelectAllColumnFilterEventListener();
    addColumnFilterCheckboxEventListener();
}

function createStaticTableElements() {
    const tableHtml = `
        <div>
            <div id="columnFilter">
                <button id="columnFilterButton">&#66022;&#66022;&#66022;</button>
                <div id="columnFilterDropdown">
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
                <thead><tr id="tableHeaderRow"></tr></thead>
                
                <tbody id="tableBody">

                </tbody>
            </table>
        </div>
    `
    document.body.innerHTML = tableHtml; // using innerHTML here is fine because no user input is used
}

/**
 * 
 * @param {*} tableData Sanitized HTML table data in the form table > tbody > tr, where the data lies in the <tr> tags.
 */
function addTableData(tableData) {
    let domParser = new DOMParser();
    let doc = domParser.parseFromString(tableData, "text/html");
    let rows = doc.body.firstChild.firstChild.children;

    for (let row of rows) {
        $('#tableBody').append(row);
    }
}

/**
 * This function takes a UTC ISO 8601 timestamp: YYYY-MM-DDThh:mm:ss.[sssss]Z
 *  and returns it like this: DD.MM.YYYY, hh:mm:ss.sss
 * **/
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

function initializeConstants() {
    COLUMN_NAMES = getDataColumns();
    NUM_COLUMNS = COLUMN_NAMES.length;
    ROWS = document.getElementById('mainTable').querySelectorAll('tr');
}

function setupTableElementsAndSorting() {
    let timestampColumnIndices = extractTimebasedColumns();
    let severityColumnIndices = extractSeverityColumns();

    postprocessHtmlElements(severityColumnIndices, timestampColumnIndices);
    setupTablesorter(severityColumnIndices, timestampColumnIndices);
}

function applyRowColorStyling() {
    $(".mainTr").filter(":visible:even").css("background-color", "rgb(33, 44, 68)");
    $(".mainTr").filter(":visible:odd").css("background-color", "rgb(27, 28, 54)");
}

function applyRowStyling() {
    applyRowColorStyling();
    
    $(".mainTr, .nestedEntry").hover(
        function() {
            $(this).css("filter", "brightness(117%)");
        },
        function() {
            $(this).css("filter", "brightness(100%)")
        }
    );
}

function buttonIsExpanded(button) {
    return button.style.transform == "rotate(90deg)";
}

function changeExpandButtonIcon(button, reset) {
    if (reset) {
        button.style.transform = "";
        button.style.paddingLeft = "";
    } else {
        button.style.transform = "rotate(90deg)";
        button.style.paddingLeft = "5px";
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

/* Nested JSON data can be expanded fully until depth ~15 or so. Starting at depth ~15 the (right) end of the table is reached and the overflow will be clipped. */
function setupRowExpansion() {
    for (let tr of $('.mainTr')) {
        let button = createRowExpandButton(false);
        let firstTd = tr.children[0];
        firstTd.prepend(button);
    }

    addExpandButtonEventListeners();   
}

function resetRowExpansionButtons() {
    $('.mainTr').each(function() {
        $(this).children().each(function() {
            if ($(this)[0].childNodes.length == 2) {
                let button = $(this)[0].childNodes[0];
                $(this)[0].removeChild(button);
            }
        })
    })

    addRowExpansionButtonToFirstVisibleColumn();
}

function addRowExpansionButtonToFirstVisibleColumn() {
    let targetColumn = $('.mainTr').first().children(":visible").first();
    if (targetColumn.length == 0 || targetColumn[0].childNodes.length == 2) { // i.e. button is present
        return;
    }

    let targetColumnIndex = targetColumn.index();
    $('.mainTr').each(function() {
        let expanded = $(this).next().is(".expansionWindow"); 
        let button = createRowExpandButton(expanded);
        $(this).children(":visible").first()[0].prepend(button);
    })

    addExpandButtonEventListeners();
}

function initializeColumnFilters() {
    let parent = document.getElementById("columnFilterDropdown");

    for (let i = 0; i < COLUMN_NAMES.length; i++) {
        let columnName = COLUMN_NAMES[i];

        let columnFilterElement = document.createElement('div');
        columnFilterElement.classList.add("columnSelect");
        
        let checkbox = document.createElement("input");
        let checkboxId = "columnCeckbox" + (i+1);
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

function toggleAllColumns(showColumns) {
    if (showColumns) {
        $('tr').children(":hidden").show();
        setupColumnWidth(NUM_COLUMNS);
        resetRowExpansionButtons();
    } else {
        $('tr').children(":visible").hide();
        setupColumnWidth(0);
    }
}

function toggleColumnDisplay(index, showColumn) {
    $('tr:not(.expansionWindow)').each(function() {
        let trColumn = $(this).children().eq(index);

        if (showColumn) trColumn.show();
        else trColumn.hide();
    })
}

/**
 * @param index Index of the column (regardless of whether the column is visible or hidden)
 * @param showColumn Whether the column should be hidden or shown.
 * 
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
    if (visibleNumColumns > 4) setupColumnWidth(visibleNumColumns);
    
    if (firstVisibleColumn.index() < index) return; // If first visible column is unaffected, the expansion button can stay where it is
    
    resetRowExpansionButtons();
}

function addColumnFilterCheckboxEventListener() {
    $('.columnFilterCheckbox').change(function() {
        let index = parseInt($(this)[0].getAttribute("index"));
        let checked = $(this)[0].checked;
        toggleColumn(index, checked);

        let columnName = $(this).siblings()[0].textContent;
        if (!checked) {
            removeColumnFromAllExpansions(columnName);
        } else {
            addColumnToAllExpansions(columnName);
        }
    })
}

function addSelectAllColumnFilterEventListener() {
    $('#selectAllCheckbox').change(function() {
        let check = this.checked;
        toggleAllColumns(check);

        $('.columnFilterCheckbox').each(function() {
            this.checked = check;
        });

        if (!check) {
            collapseAllExpansions();
        }
    })
}

/* Returns relative index of the previous entry (within the expansion window). */
function getIndexOfPrevEntry(columnName) {
    let indexOfColumn = COLUMN_NAMES.indexOf(columnName);    
    let expandedColumnIndices = [];

    $('.expandTable').first().children(":nth-child(even)").each(function(index, element) {
        let currColumnName = element.children[1].textContent;
        expandedColumnIndices.push(COLUMN_NAMES.indexOf(currColumnName));
    })

    // case: column is inserted at position 0
    if (expandedColumnIndices.length == 0 || indexOfColumn < expandedColumnIndices[0]) {
        return null;
    }

    // case: column is inserted at position 1+. here we want to get the maximum index that is still smaller than indexOfColumn
    for (let i = 1; i < expandedColumnIndices.length; i++) {
        let columnIndex = expandedColumnIndices[i];

        if (columnIndex > indexOfColumn) {
            return i-1;
        }
    }

    return null;
}

function addColumnToAllExpansions(columnName) {
    let visibleDataTds = $('.expansionWindow').prev().children(":visible");
    let nextColumns = COLUMN_NAMES.slice(COLUMN_NAMES.indexOf(columnName) + 1);
    let indexOfPrevEntry = getIndexOfPrevEntry(columnName);

    visibleDataTds.each(function() {
        let dataTd = $(this);
        let targetColumnName = $(this)[0].getAttribute("data-column");
        let nestedTable = $(this).closest('.mainTr').next().children().first().children();
        
        if (columnName == targetColumnName) {
            addExpandedRowEntry(dataTd, nestedTable, indexOfPrevEntry);
        }
    })
}

function removeColumnFromAllExpansions(targetColumnName) {
    $('.expandedRow').each(function() {
        let columnName = $(this)[0].children[1].textContent;

        if (columnName == targetColumnName) {
            $(this).next().remove(); // removes the <hr>
            $(this).remove();
        }
    })
}

function addColumnFilterButtonEventListener() {
    $('#columnFilterButton').on('click', function(e) {
        let button = $(this)[0];
        $(this).next().toggle(TOGGLE_ANIMATION_MS);
    })
}

function collapseAllExpansions() {
    $('.expansionWindow').each(function() {
        $(this)[0].remove();
    })
}

function addExpandButtonEventListeners() {
    $('.expandButton').filter(':visible').on('click', function() {
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
 * TODO: NICE TO HAVE: The regulra row expansion collapses expansions based on the button icon. This may be 
 * possible here as well and might simplify the collapsing logic.
 */
function addJsonExpansionEvent(jsonButton, row) {
    $(jsonButton).on('click', function() {
        let isExpanded = false;
        let childExpansion = getChildExpansion(row);
        if (childExpansion != null) { // case: collapse
            childExpansion.remove();
            changeExpandButtonIcon(jsonButton, true);
            return;
        }

        let jsonData = $(this).next().next()[0].textContent;
        expandJson(jsonData, row);
        changeExpandButtonIcon(jsonButton, false);
        prepareJsonExpansion();
    })
}

/**
 * 
 * @param dataTd A JQuery object of a <dataTd>
 * @param table The expansion table that the entry will be added into.
 * @param indexOfPrevEntry The relative index of the previous entry within the expansion.
 * */
function addExpandedRowEntry(dataTd, table, indexOfPrevEntry) {
    let td = dataTd[0];
    let i = dataTd.index();
    
    let key = COLUMN_NAMES[i];
    let childNodes = td.cloneNode(true).childNodes;
    let elem = extractElementFromChildNodes(childNodes);
    let nestedEntry = addNestedEntry(key, elem, BASE_INDENT, style=td.style, title=td.title);
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

    $(".mainTr").eq(index).children(":visible").each(function() {
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

        let potentialJsonString = dataValue.textContent;
        let jsonData = tryGetJSON(potentialJsonString, warn=false);
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
 * 
 * childNodes: a childNodes element that is either of the form [text], [a], or [button, text]
 * */
function extractElementFromChildNodes(childNodes) {
    if (childNodes.length == 0) return null;

    if (childNodes.length == 2 && childNodes[0].type == "button") {
        return childNodes[1];
    }

    return childNodes[0];
}

function expandJson(jsonString, row) {
    let jsonData = tryGetJSON(jsonString); // TODO: NICE TO HAVE: right now the approach is: check if data is json => if yes, add it as textContent => on click, take textContent and turn it back into JSON. this is less than ideal
    let parent = row.parentElement;
    let parentIndent = parseInt(row.children[0].style.width, 10); 
    let indent = parentIndent + 2*BASE_INDENT;
    let nextRow = row.nextSibling.nextSibling;
    let wrapper = document.createElement('div');
    wrapper.classList.add("childExpansion");

    let finalHr = null;
    for (let key of Object.keys(jsonData)) {
        let value = jsonData[key];
        let text = typeof value === "object" ? JSON.stringify(value) : value;
        let elem = document.createTextNode(text);

        let nestedEntry = addNestedEntry(key, elem, indent);
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
    
    let numColumns = ROWS[0].children.length;
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

function addNestedEntry(key, elem, indent, style=null, title=null) {
    let nestedEntry = document.createElement('div');
    let indentElement = document.createElement('div');
    let dataKey = document.createElement('div');
    let dataValue = document.createElement('div');

    nestedEntry.classList.add("expandedRow");
    nestedEntry.style="display: flex; height: 20px; line-height: 20px;";

    indentElement.style.width = indent + "px";    
    dataKey.textContent = key;
    dataKey.style = "width: 200px; margin-right: 30px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: small; font-weight: bold; display: flex; align-items: center;";        

    if (elem != null) dataValue.appendChild(elem);
    dataValue.classList.add("expandedDataValue");
    dataValue.style = "width: 500px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: small; display: block;";

    if (style != null) dataValue.style.color = style.color;
    if (title != null) dataValue.title = title;
    
    nestedEntry.appendChild(indentElement);
    nestedEntry.appendChild(dataKey);
    nestedEntry.appendChild(dataValue);

    return nestedEntry;
}

function setupColumnWidth(visibleNumColumns) {     
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
function setupTableHeaders() {
    let TH_TEMPLATE = `
            <div class="header-text"></div>
            <div class="function-bar">
                <div class="filter-icon-container"><div class="filter-icon">&#9906;</div></div>
                <div class="dropdown-menu">
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
                <div class="sort-icon">
                    <div class="up-arrow">&uarr;</div>
                    <div class="down-arrow">&darr;</div>
                </div>
                <div class="resize-area">
                    <div class="separator">|</div>
                </div>
            </div>`;
    
    let tableHeaderRow = document.getElementById("tableHeaderRow");
    for (let i = 0; i < NUM_COLUMNS; i++) {
        let columnName = COLUMN_NAMES[i].toUpperCase();
        let th = document.createElement('th');
        th.classList.add("mainTh");
        th.insertAdjacentHTML("beforeend", TH_TEMPLATE);
        th.children[0].textContent = columnName;
        tableHeaderRow.appendChild(th);
    }
}

function setupRecordsDisplay() {
    let numRecords = $('.mainTr').length;
    
    document.getElementById("numRecords").textContent = numRecords;
    document.getElementById("numRecordsText").textContent = numRecords == 1 ? "Record Found" : "Records Found";
}


function extractTimebasedColumns() {
    let timestampColumnIndices = [];
    for (let i = 0; i < COLUMN_NAMES.length; i++) {
        let columnName = COLUMN_NAMES[i];
        if (isTimestampColumn(columnName)) {
            timestampColumnIndices.push(i);
        }
    }

    return timestampColumnIndices;
}

function extractSeverityColumns() {
    // 1. extract potential severity column candidates based on the column name
    let severityColumnIndices = [];
    let severityColumnCandidates = [];
    for (let i = 0; i < COLUMN_NAMES.length; i++) {
        let columnName = COLUMN_NAMES[i];
        if (isSeverityColumn(columnName)) {
            severityColumnCandidates.push(i);
        }
    }

    // 2. check if all entries of the column are severities and if so, extract the column
    for (let severityColumnCandidate of severityColumnCandidates) { // usually the number of candidates is equal to one, i.e. this for loop just runs once on average
        let allEntriesAreSeverities = true;

        for (let i = 1; i < ROWS.length; i++) {
            let currentColumn = ROWS[i].children[severityColumnCandidate];
            if (currentColumn == undefined || currentColumn.textContent == undefined) continue;

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

function postprocessHtmlElements(severityColumnIndices, timestampColumnIndices) {
    for (let i = 0; i < ROWS.length; i++) {
        let tr = ROWS[i];
        for (let columnIndex = 0; columnIndex < NUM_COLUMNS; columnIndex++) {
            let td = i == 0 ? tr.children[columnIndex].children[0] : tr.children[columnIndex];
            if (td == undefined || td.textContent == undefined) continue;
            let data = td.textContent;
            
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
                td.childNodes[td.childNodes.length - 1] = prettyTimestamp(data); // TODO: fix issue
            }
        }
    }
}

function setupTablesorter(severityColumnIndices, timestampColumnIndices) {
    // Add custom severity parser
    $.tablesorter.addParser({
        id: 'severity',
        is: function(str) {
            return false;
        },
        format: function(str) {
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
        configurationOptions[severityColumnIndex] = {sorter: 'severity'};
    }

    for (let timestampColumnIndex of timestampColumnIndices) {
        configurationOptions[timestampColumnIndex] = {sorter: 'text'};
    }

    $("table")
        .tablesorter({
            selectorSort: '.sort-icon',
            headers: configurationOptions,
            sortReset: true
        })

        .bind("sortEnd", function(e, t) {
            applyRowColorStyling()
        });
}

/* TODO: NICE TO HAVE: This function removes all expansion windows and is used when the table is sorted while an expansion window is active. 
    Ideally, each expanded window should be bound to the corresponding <tr> but since that requires quite a bit more code
    the simpler solution is to delete all expansion windows on tablesort. */
function removeAllExpandWindows() {
    let allExpansionWindows = $(".expansionWindow");

    $(".expansionWindow").each(function() {
        let button = $(this).prev().children().first()[0].childNodes[0];
        changeExpandButtonIcon(button, true);
        $(this).remove();
    })
}

function setupSortIconDisplay() {
    $('.sort-icon').on('click', function (e) {
        let upArrow = e.currentTarget.children[0];
        let downArrow = e.currentTarget.children[1];
        let upArrowColor = window.getComputedStyle(upArrow).color;
        let downArrowColor = window.getComputedStyle(downArrow).color;
        let white = "rgb(255, 255, 255)";
        let black = "rgb(0, 0, 0)";

        if (upArrowColor == white && downArrowColor == white) {
            // reset all arrow colors
            let sortIcons = document.getElementsByClassName('sort-icon')
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

function getActiveDropdownMenu() {
    let activeDropdowns = [];
    $('.dropdown-menu').each(function(index, elem) {
        if ($(this).is(":visible")) {
            activeDropdowns.push($(this));
        }
    })

    if (activeDropdowns.length == 0) return null;

    return activeDropdowns[0];
}

function setupDropdownMenu() {
    $(".filter-icon-container").on('click', function(e) {
        let activeDropdownMenu = getActiveDropdownMenu();
        let currentFunctionBar = $(this).closest('.function-bar')[0];
        let dropdownMenu = $(this).siblings().first();
        
        if (activeDropdownMenu != null) {
            // Close the previously active dropdown:
            toggleDropdownMenu(activeDropdownMenu);

            // Case: Dropdown Menu was closed through direct button click
            if (activeDropdownMenu.is(dropdownMenu)) {
                e.stopPropagation();
                return;
            }
        }

        toggleDropdownMenu(dropdownMenu);
        e.stopPropagation()
    });
}

/* Note: The parameter dropdownMenu has to be a JQuery object */
function toggleDropdownMenu(dropdownMenu) {
    dropdownMenu.siblings().first()[0].classList.toggle('border');
    dropdownMenu.toggle(TOGGLE_ANIMATION_MS);
}

function setupDropdownMenuOutOfScopeClosing() {
    $("html").on('click', function(e){
        let activeDropdownMenu = getActiveDropdownMenu();
        if (activeDropdownMenu == null) return;

        let targetIsInDropdownMenu = e.target.closest('.dropdown-menu') != null;
        if (!targetIsInDropdownMenu) toggleDropdownMenu(activeDropdownMenu);
    })
}

function resetFilterAfterModeChange() {
    let dropdownMenu = $(this).closest('.dropdown-menu')[0];
    dropdownMenu.children[1].children[0].value = "";

        $('tbody .mainTr').filter(function() {
        $(this).toggle(true);
    })
}

function toggleFilter() {
    removeAllExpandWindows();

    let columnIndex = $(this).closest('th').index();
    let filterValue = $(this).val().toLowerCase();
    let filterMode = $(this).closest('.dropdown-menu')[0].children[0].children[0].value; // TODO: NICE TO HAVE: should probably find a better way to do this
    
    $('tbody .mainTr').filter(function() {
        let entry = $(this)[0].children[columnIndex];
        let value;
        
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

        applyRowColorStyling();
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

function tryGetJSON(potentialJSONString, warn=true) {
    if (potentialJSONString == "[]" || potentialJSONString == "{}" || potentialJSONString == "") return null; // TODO: find more sophisticated way to prevent dummy json data

    try {
        let jsonData = JSON.parse(potentialJSONString);

        if (jsonData && typeof jsonData === "object") return jsonData;
        else return null;
    } catch(e) {
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
    $(".resize-area").on('mousedown', function(e) {
        let index = $(this).closest('th').index(); // Index of the current column that is being moved
        if (index == NUM_COLUMNS - 1) return;

        let neighborIndex = $(this).closest('th').nextAll(":visible").first().index();
        let column = [];
        let neighborColumn = [];
        for (let i = 0; i < ROWS.length; i++) {
            column[i] = ROWS[i].children[index];
            if (neighborIndex != -1) neighborColumn[i] = ROWS[i].children[neighborIndex];
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