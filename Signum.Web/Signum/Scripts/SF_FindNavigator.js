﻿if (!FindNavigator && typeof FindNavigator == "undefined") {

    $(function () {
        $(".searchControl th:not(.thRowEntity):not(.thRowSelection)")
        .live('click', function (e) {
            if ($(this).hasClass("columnEditing"))
                return true;
            Sort(e);
            return false;
        })
        .live('mousedown', function (e) {
            if ($(this).hasClass("columnEditing"))
                return true;
            this.onselectstart = function () { return false };
            return false;
        });

        $(".tblResults td").live('contextmenu', function (e) {
            if ($(e.target).hasClass("searchCtxMenuOverlay") || $(e.target).parents().hasClass("searchCtxMenuOverlay")) {
                $('.searchCtxMenuOverlay').remove();
                return false;
            }

            var $this = $(this);
            var index = $this.index();
            var $th = $this.closest("table").find("th").eq(index);
            if ($th.hasClass('thRowSelection'))
                return false;
            if ($th.hasClass('thRowEntity'))
                EntityCellContextMenu(e);
            else
                CellContextMenu(e);
            return false;
        });

        $('.searchCtxItem.quickFilter').live('click', function () {
            log("contextmenu item click");
            var $elem = $(this).closest("td");
            $('.searchCtxMenuOverlay').remove();
            QuickFilter($elem);
        });
    });

    function EntityCellContextMenu(e) {
        log("entity contextmenu");

        var $target = $(e.target);

        var hiddenQueryName = $target.closest(".searchControl").children("input:hidden[id$=sfQueryUrlName]");
        var idHiddenQueryName = hiddenQueryName.attr('id');
        var prefix = idHiddenQueryName.substring(0, idHiddenQueryName.indexOf("sfQueryUrlName"));
        if (prefix.charAt(prefix.length - 1) == "_")
            prefix = prefix.substring(0, prefix.length - 1);

        var showCtx = window[prefix.compose("EntityContextMenu")];
        if (showCtx == undefined || isFalse(showCtx))
            return false; //EntityContextMenu not active

        var $cmenu = $("<div class='searchCtxMenu'></div>");
        $('<div class="searchCtxMenuOverlay"></div>').click(function (e) {
            log("contextmenu click");
            var $target = $(e.target);
            if ($target.hasClass("searchCtxItem") || $target.parent().hasClass("searchCtxItem"))
                $cmenu.hide();
            else
                $('.searchCtxMenuOverlay').remove();
        }).append($cmenu).appendTo($target);
        $cmenu.css({
            left: $target.position().left + ($target.outerWidth() / 2),
            top: $target.position().top + ($target.outerHeight() / 2),
            zIndex: '101'
        }).show();

        $target.addClass("contextmenu-active");
        SF.ajax({
            url: 'Signum/GetContextualPanel',
            type: "POST",
            async: true,
            dataType: "html",
            data: { liteUrl: $target.children('a').attr('href'), sfQueryUrlName: hiddenQueryName.val(), prefix: prefix },
            success: function (items) { $cmenu.html(items); }
        });

        return false;
    }

    function CellContextMenu(e) {
        log("contextmenu");
        var $target = $(e.target);

        var $cmenu = $("<div class='searchCtxMenu'><div class='searchCtxItem quickFilter'><span>Add filter</span></div></div>");
        $('<div class="searchCtxMenuOverlay"></div>').click(function (e) {
            log("contextmenu click");
            var $target = $(e.target);
            if ($target.hasClass("searchCtxItem") || $target.parent().hasClass("searchCtxItem"))
                $cmenu.hide();
            else
                $('.searchCtxMenuOverlay').remove();
        }).append($cmenu).appendTo($target);
        $cmenu.css({
            left: $target.position().left + ($target.outerWidth() / 2),
            top: $target.position().top + ($target.outerHeight() / 2),
            zIndex: '101'
        }).show();

        return false;
    }

    var FindNavigator = function (_findOptions) {
        this.findOptions = $.extend({
            prefix: "",
            queryUrlName: null,
            searchOnLoad: false,
            allowMultiple: null,
            create: true,
            view: true,
            top: null,
            filters: null,
            filterMode: null,
            orders: null, //A Json array like ["columnName1","-columnName2"] => will order by columnname1 asc, then by columnname2 desc
            columns: null, //List of column names "columnName1,columnName2"
            columnMode: null,
            allowUserColumns: null,
            navigatorControllerUrl: "Signum/PartialFind",
            searchControllerUrl: "Signum/Search",
            onOk: null,
            onCancelled: null,
            onOkClosed: null,
            async: true
        }, _findOptions);

        this.$control = $(this.pf("divSearchControl"));
    };

    FindNavigator.prototype = {

        pf: function (s) {
            return "#" + this.findOptions.prefix.compose(s);
        },

        tempDivId: function () {
            return this.findOptions.prefix + "Temp";
        },

        openFinder: function () {
            log("FindNavigator openFinder");
            var self = this;
            SF.ajax({
                type: "POST",
                url: this.findOptions.navigatorControllerUrl,
                data: this.requestDataForOpenFinder(),
                async: false,
                dataType: "html",
                success: function (popupHtml) {
                    $('#divASustituir').after(hiddenDiv(self.tempDivId(), popupHtml));
                    new popup().show(self.tempDivId());
                    $(self.pf(sfBtnOk)).unbind('click').click(function () { self.onSearchOk(); });
                    $(self.pf(sfBtnCancel)).unbind('click').click(function () { self.onSearchCancel(); });
                }
            });
        },

        selectedItems: function () {
            log("FindNavigator selectedItems");
            var items = [];
            var selected = $("input:radio[name=" + this.findOptions.prefix.compose("rowSelection") + "]:checked, input:checkbox[name^=" + this.findOptions.prefix.compose("rowSelection") + "]:checked");
            if (selected.length == 0)
                return items;

            var self = this;
            selected.each(function (i, v) {
                var parts = v.value.split("__");
                var item = {
                    id: parts[0],
                    type: parts[1],
                    toStr: parts[2],
                    link: $(this).parent().next().children('a').attr('href')
                };
                items.push(item);
            });

            return items;
        },

        splitSelectedIds: function () {
            log("FindNavigator splitSelectedIds");
            var selected = this.selectedItems();
            var result = [];
            for (var i = 0, l = selected.length; i < l; i++) {
                result.push(selected[i].id + ",");
            }

            if (result.length) {
                var result2 = result.join('');
                return result2.substring(0, result2.length - 1);
            }
            return '';
        },

        search: function () {
            this.editColumnsFinish();

            var $btnSearch = $(this.pf("btnSearch"));
            $btnSearch.toggleClass('loading').val(lang.signum.searching);

            var self = this;
            SF.ajax({
                type: "POST",
                url: this.findOptions.searchControllerUrl,
                data: this.requestDataForSearch(),
                async: this.findOptions.async,
                dataType: "html",
                success: function (r) {
                    var idBtnSearch = $btnSearch.attr('id');
                    if (asyncSearchFinished[idBtnSearch])
                        asyncSearchFinished[idBtnSearch] = false;
                    $btnSearch.val(lang.signum.search).toggleClass('loading');
                    if (!empty(r))
                        self.$control.find(".divResults tbody").html(r);
                    else {
                        var columns = $(self.pf("divResults th")).length;
                        self.$control.find(".divResults tbody").html("<tr><td colspan=\"" + columns + "\">" + lang.signum.noResults + "</td></tr>")
                    }
                },
                error: function () {
                    $btnSearch.val(lang.signum.search).toggleClass('loading');
                }
            });

        },

        requestDataForSearch: function () {
            var requestData = new Object();
            requestData[sfQueryUrlName] = $(this.pf(sfQueryUrlName)).val();
            requestData[sfTop] = $(this.pf(sfTop)).val();
            requestData[sfAllowMultiple] = $(this.pf(sfAllowMultiple)).val();

            var canView = $(this.pf(sfView)).val();
            requestData[sfView] = (empty(canView) ? true : canView);

            var currentfilters = this.serializeFilters();
            if (!empty(currentfilters))
                $.extend(requestData, currentfilters);

            requestData["sfOrderBy"] = this.serializeOrders();
            requestData["sfColumns"] = this.serializeColumns();
            requestData["sfColumnMode"] = 'Replace';

            requestData[sfPrefix] = this.findOptions.prefix;
	return requestData;
	},

    requestDataForOpenFinder: function () {
        var requestData = new Object();
        requestData[sfQueryUrlName] = this.findOptions.queryUrlName;
        requestData[sfTop] = this.findOptions.top;
        requestData[sfAllowMultiple] = this.findOptions.allowMultiple;
        if (this.findOptions.view == false)
            requestData[sfView] = this.findOptions.view;
        if (this.findOptions.searchOnLoad == true)
            requestData["sfSearchOnLoad"] = this.findOptions.searchOnLoad;

            if (this.findOptions.async)
                requestData["sfAsync"] = this.findOptions.async;

            if (this.findOptions.filterMode != null)
                requestData["sfFilterMode"] = this.findOptions.filterMode;

            if (!this.findOptions.create)
                requestData["sfCreate"] = this.findOptions.create;

            if (!empty(this.findOptions.filters)) {
                var filterArray = this.findOptions.filters.split("&");
                for (var i = 0, l = filterArray.length; i < l; i++) {
                    var pair = filterArray[i];
                    if (!empty(pair)) {
                        pair = pair.split("=");
                        if (pair.length == 2)
                            requestData[pair[0]] = pair[1];
                    }
                }
            }
        
        if (this.findOptions.orders != null)
            requestData["sfOrderBy"] = this.findOptions.orders;
        if (this.findOptions.columns != null)
            requestData["sfColumns"] = this.findOptions.columns;
            if (this.findOptions.columnMode != null)
                requestData["sfColumnMode"] = this.findOptions.columnMode;

            requestData[sfPrefix] = this.findOptions.prefix;

            return requestData;
        },

        serializeFilters: function () {
            var result = "", self = this;
            $(this.pf("tblFilters > tbody > tr")).each(function () {
                result = $.extend(result,
                self.serializeFilter($(this)));
            });
            return result;
        },

        serializeFilter: function ($filter) {

            var id = $filter[0].id;
            var index = id.substring(id.lastIndexOf("_") + 1, id.length);

            var selector = $(this.pf("ddlSelector").compose(index) + " option:selected", $filter);
            var value = $(this.pf("value").compose(index), $filter).val();

            var valBool = $("input:checkbox[id=" + this.findOptions.prefix.compose("value").compose(index) + "]", $filter); //it's a checkbox

            if (valBool.length > 0) value = valBool[0].checked;

            var info = RuntimeInfoFor(this.findOptions.prefix.compose("value").compose(index));
            if (info.find().length > 0) //If it's a Lite, the value is the Id
                value = info.id() + ";" + info.runtimeType();

            var filter = new Object();
            filter["cn" + index] = $filter.find("td")[0].id.split("__")[1];
            filter["sel" + index] = selector.val();
            filter["val" + index] = value;
            return filter;
        },

        serializeOrders: function () {
            var currOrder = $(this.pf("OrderBy")).val();
            if (empty(currOrder))
                return "";
            return currOrder.replace(/"/g, "");
        },

        setNewSortOrder: function (columnName, multiCol) {
            log("FindNavigator sort");
            var currOrderArray = [];
            var currOrder = $(this.pf("OrderBy")).val();
            if (!empty(currOrder))
                currOrderArray = currOrder.split(",");

            var found = false;
            var currIndex;
            var oldOrder = "";
            for (var currIndex = 0; currIndex < currOrderArray.length && !found; currIndex++) {
                found = currOrderArray[currIndex] == columnName;
                if (found) {
                    oldOrder = "";
                    break;
                }
                found = currOrderArray[currIndex] == "-" + columnName;
                if (found) {
                    oldOrder = "-";
                    break;
                }
            }
            var newOrder = found ? (oldOrder == "" ? "-" : "") : "";
            var currOrder = $(this.pf("OrderBy"));
            if (!multiCol) {
                this.$control.find(".divResults th").removeClass("headerSortUp headerSortDown");
                currOrder.val(newOrder + columnName);
            }
            else {
                if (found)
                    currOrderArray[currIndex] = newOrder + columnName;
                else
                    currOrderArray[currOrderArray.length] = newOrder + columnName;
                var currOrderStr = "";
                for (var i = 0; i < currOrderArray.length; i++)
                    currOrderStr = currOrderStr.compose(currOrderArray[i], ",");
                currOrder.val(currOrderStr);
            }

            var $header = this.$control.find(".divResults th[id='" + this.findOptions.prefix.compose(columnName) + "']");
            if (newOrder == "-")
                $header.removeClass("headerSortDown").addClass("headerSortUp");
            else
                $header.removeClass("headerSortUp").addClass("headerSortDown");

            return this;
        },

        serializeColumns: function () {
            log("FindNavigator serializeColumns");
            var result = "";
            var self = this;
            $(this.pf("tblResults thead tr th:not(.thRowEntity):not(.thRowSelection)")).each(function () {
                var $this = $(this);
                result = result.compose($this.find("input:hidden").val() + ";" + $this.text().trim(), ",");
            });
            return result;
        },

        onSearchOk: function () {
            log("FindNavigator onSearchOk");
            var selected = this.selectedItems();
            if (selected.length == 0)
                return;
            var doDefault = (this.findOptions.onOk != null) ? this.findOptions.onOk(selected) : true;
            if (doDefault != false) {
                $('#' + this.tempDivId()).remove();
                if (this.findOptions.onOkClosed != null)
                    this.findOptions.onOkClosed();
            }
        },

        onSearchCancel: function () {
            log("FindNavigator onSearchCancel");
            $('#' + this.tempDivId()).remove();
            if (this.findOptions.onCancelled != null)
                this.findOptions.onCancelled();
        },

        addColumn: function () {
            log("FindNavigator addColumn");

            if (isFalse(this.findOptions.allowUserColumns) || $(this.pf("tblFilters tbody")).length == 0)
                throw "Adding columns is not allowed";

            this.editColumnsFinish();

            var tokenName = this.constructTokenName();
            if (empty(tokenName)) return;

            var prefixedTokenName = this.findOptions.prefix.compose(tokenName);
            if ($(this.pf("tblResults thead tr th[id=\"" + prefixedTokenName + "\"]")).length > 0) return;

            var $tblHeaders = $(this.pf("tblResults thead tr"));
            $tblHeaders.append("<th id=\"" + prefixedTokenName + "\"><input type=\"hidden\" value=\"" + tokenName + "\" />" + tokenName + "</th>");
            $(this.pf("btnEditColumns")).show();
        },

        editColumns: function () {
            log("FindNavigator editColumns");

            var self = this;
            $(this.pf("tblResults thead tr th:not(.thRowEntity):not(.thRowSelection)")).each(function () {
                var th = $(this);
                th.addClass("columnEditing");
                var hidden = th.find("input:hidden");
                th.html("<input type=\"text\" value=\"" + th.text().trim() + "\" />" +
                    "<br /><a id=\"link-delete-user-col\" onclick=\"DeleteColumn('" + self.findOptions.prefix + "', '" + hidden.val() + "');\">Delete Column</a>")
              .append(hidden);
            });

            $(this.pf("btnEditColumnsFinish")).show();
            $(this.pf("btnEditColumns")).hide();
        },

        editColumnsFinish: function () {
            log("FindNavigator editColumnsFinish");

            var $btnFinish = $(this.pf("btnEditColumnsFinish:visible"));
            if ($btnFinish.length == 0)
                return;

            var self = this;
            $(this.pf("tblResults thead tr th:not(.thRowEntity):not(.thRowSelection)")).each(function () {
                var th = $(this);
                th.removeClass("columnEditing");
                var hidden = th.find("input:hidden");
                var newColName = th.find("input:text").val();
                th.html(newColName).append(hidden);
            });

            $btnFinish.hide();
            $(this.pf("btnEditColumns")).show();
        },

        deleteColumn: function (columnName) {
            log("FindNavigator deleteColumn");

            var self = this;
            $(this.pf("tblResults thead tr th"))
        .filter(function () { return $(this).find("input:hidden[value='" + columnName + "']").length > 0 })
        .remove();

            $(this.pf("tblResults tbody")).html("");

            if ($(this.pf("tblResults thead tr th")).length == 0)
                $(this.pf("btnEditColumnsFinish")).hide();
        },

        addFilter: function () {
            log("FindNavigator addFilter");

            var tableFilters = $(this.pf("tblFilters tbody"));
            if (tableFilters.length == 0)
                throw "Adding filters is not allowed";

            var tokenName = this.constructTokenName();
            if (empty(tokenName)) return;

            var queryUrlName = ((empty(this.findOptions.queryUrlName)) ? $(this.pf(sfQueryUrlName)).val() : this.findOptions.queryUrlName);

            var self = this;
            SF.ajax({
                type: "POST",
                url: "Signum/AddFilter",
                data: { "sfQueryUrlName": queryUrlName, "tokenName": tokenName, "index": this.newFilterRowIndex(), "prefix": this.findOptions.prefix },
                async: false,
                dataType: "html",
                success: function (filterHtml) {
                    var $filterList = self.$control.find(".filters-list");
                    $filterList.find(".explanation").hide();
                    $filterList.find("table").show();
                    tableFilters.append(filterHtml);

                    $(self.pf("btnClearAllFilters"), self.$control).show();
                }
            });
        },

        newFilterRowIndex: function () {
            log("FindNavigator newFilterRowIndex");
            var lastRow = $(this.pf("tblFilters tbody tr:last"));
            var lastRowIndex = -1;
            if (lastRow.length == 1)
                lastRowIndex = lastRow[0].id.substr(lastRow[0].id.lastIndexOf("_") + 1, lastRow[0].id.length);
            return parseInt(lastRowIndex) + 1;
        },

        newSubTokensCombo: function (index) {
            log("FindNavigator newSubTokensCombo");
            var selectedColumn = $(this.pf("ddlTokens_" + index));
            if (selectedColumn.length == 0) return;

            //Clear child subtoken combos
            var self = this;
            $("select,span")
        .filter(function () {
            return ($(this).attr("id").indexOf(self.findOptions.prefix.compose("ddlTokens_")) == 0)
            || ($(this).attr("id").indexOf(self.findOptions.prefix.compose("lblddlTokens_")) == 0)
        })
        .filter(function () {
            var currentId = $(this).attr("id");
            var lastSeparatorIndex = currentId.lastIndexOf("_");
            var currentIndex = currentId.substring(lastSeparatorIndex + 1, currentId.length);
            return parseInt(currentIndex) > index;
        })
        .remove();

            if (selectedColumn.children("option:selected").val() == "") return;

            var tokenName = this.constructTokenName();
            var queryUrlName = ((empty(this.findOptions.queryUrlName)) ? $(this.pf(sfQueryUrlName)).val() : this.findOptions.queryUrlName);

            SF.ajax({
                type: "POST",
                url: "Signum/NewSubTokensCombo",
                data: { "sfQueryUrlName": queryUrlName, "tokenName": tokenName, "index": index, "prefix": this.findOptions.prefix },
                async: false,
                dataType: "html",
                success: function (newCombo) {
                    $(self.pf("ddlTokens_" + index)).after(newCombo);
                }
            });
        },

        constructTokenName: function () {
            log("FindNavigator constructTokenName");
            var tokenName = "",
            stop = false;
            //var $fieldsList = $(".fields-list", this.$control);

            for (var i = 0; !stop; i++) {
                var currSubtoken = $(this.pf("ddlTokens_" + i));
                if (currSubtoken.length > 0)
                    tokenName = tokenName.compose(currSubtoken.val(), ".");
                else
                    stop = true;
            }
            return tokenName;
        },

        quickFilter: function ($elem) {
            log("FindNavigator quickFilter");
            var tableFilters = $(this.pf("tblFilters tbody"));
            if (tableFilters.length == 0)
                return;
            var params;
            var ahref = $elem.children('a');
            if (ahref.length == 0) {
                var cb = $elem.find("input:checkbox");
                if (cb.length == 0)
                    params = { "isLite": "false", "sfValue": $elem.html().trim() };
                else
                    params = { "isLite": "false", "sfValue": (cb.filter(":checked").length > 0) };
            }
            else {
                var route = ahref.attr("href");
                var separator = route.indexOf("/");
                var lastSeparator = route.lastIndexOf("/");
                params = { "isLite": "true", "typeUrlName": route.substring(separator + 1, lastSeparator), "sfId": route.substring(lastSeparator + 1, route.length) };
            }

            var cellIndex = $elem[0].cellIndex;

            params = $.extend(params, {
                "sfQueryUrlName": $(this.pf(sfQueryUrlName)).val(),
                "tokenName": $($($elem.closest(".tblResults")).find("th")[cellIndex]).children("input:hidden").val(),
                "prefix": this.findOptions.prefix,
                "index": this.newFilterRowIndex()
            });

            var self = this;
            SF.ajax({
                type: "POST",
                url: "Signum/QuickFilter",
                data: params,
                async: false,
                dataType: "html",
                success: function (filterHtml) {
                    var $filterList = self.$control.find(".filters-list");
                    $filterList.find(".explanation").hide();
                    $filterList.find("table").show();
                    tableFilters.append(filterHtml);
                    $(self.pf("btnClearAllFilters"), self.$control).show();
                }
            });
        },

        deleteFilter: function (elem) {
            var $tr = $(elem).closest("tr");
            if ($tr.find("select[disabled]").length)
                return;

            if ($tr.siblings().length == 0) {
                var $filterList = $tr.closest(".filters-list");
                $filterList.find(".explanation").show();
                $filterList.find("table").hide();
                $(this.pf("btnClearAllFilters"), this.$control).hide();
            }

            $tr.remove();
        },

        clearAllFilters: function () {
            log("FindNavigator clearAllFilters");

            this.$control.find(".filters-list")
                     .find(".explanation").show().end()
                     .find("table").hide()
                      .find("tbody > tr").remove();

            $(this.pf("btnClearAllFilters"), this.$control).hide();

        },

        requestDataForSearchPopupCreate: function () {
            var requestData = this.serializeFilters();
            var requestData = $.extend(requestData, { sfQueryUrlName: ((empty(this.findOptions.queryUrlName)) ? $(this.pf(sfQueryUrlName)).val() : this.findOptions.queryUrlName) });
            return requestData;
        },

        viewOptionsForSearchCreate: function (_viewOptions) {
            log("FindNavigator viewOptionsForSearchCreate");
            if (this.findOptions.prefix != _viewOptions.prefix)
                throw "FindOptions prefix and ViewOptions prefix don't match";
            _viewOptions.prefix = "New".compose(_viewOptions.prefix);
            var self = this;
            return $.extend({
                type: $(this.pf(sfEntityTypeName)).val(),
                containerDiv: null,
                onCancelled: null,
                controllerUrl: empty(this.findOptions.prefix) ? "Signum/Create" : "Signum/PopupCreate"
            }, _viewOptions);
        },

        viewOptionsForSearchPopupCreate: function (_viewOptions) {
            log("FindNavigator viewOptionsForSearchPopupCreate");
            if (this.findOptions.prefix != _viewOptions.prefix)
                throw "FindOptions prefix and ViewOptions prefix don't match";
            _viewOptions.prefix = "New".compose(_viewOptions.prefix);
            var self = this;
            return $.extend({
                type: $(this.pf(sfEntityTypeName)).val(),
                containerDiv: null,
                requestExtraJsonData: this.requestDataForSearchPopupCreate(),
                onCancelled: null,
                controllerUrl: empty(this.findOptions.prefix) ? "Signum/Create" : "Signum/PopupCreate"
            }, _viewOptions);
        },

        toggleSelectAll: function () {
            log("FindNavigator toggleSelectAll");
            var select = $(this.pf("cbSelectAll:checked"));
            $("input:checkbox[name^=" + this.findOptions.prefix.compose("rowSelection") + "]")
        .attr('checked', (select.length > 0) ? true : false);
        }
    };

    function OpenFinder(_findOptions) {
        new FindNavigator(_findOptions).openFinder();
    }

    function Search(_findOptions) {
        new FindNavigator(_findOptions).search();
    }

    function SelectedItems(_findOptions) {
        return new FindNavigator(_findOptions).selectedItems();
    }

    function SplitSelectedIds(_findOptions) {
        return new FindNavigator(_findOptions).splitSelectedIds();
    }

    function HasSelectedItems(_findOptions, onSuccess) {
        log("FindNavigator HasSelectedItems");
        var items = SelectedItems(_findOptions);
        if (items.length == 0) {
            NotifyInfo(lang.signum.noElementsSelected);
            return;
        }
        onSuccess(items);
    }

    function AddColumn(prefix) {
        new FindNavigator({ prefix: prefix }).addColumn();
    }

    function EditColumns(prefix) {
        new FindNavigator({ prefix: prefix }).editColumns();
    }

    function EditColumnsFinish(prefix) {
        new FindNavigator({ prefix: prefix }).editColumnsFinish();
    }

    function DeleteColumn(prefix, columnName) {
        new FindNavigator({ prefix: prefix }).deleteColumn(columnName);
    }

    function AddFilter(prefix) {
        new FindNavigator({ prefix: prefix }).addFilter();
    }

    function NewSubTokensCombo(_findOptions, index) {
        new FindNavigator(_findOptions).newSubTokensCombo(index);
    }

    function QuickFilter($elem) {
        var idtblresults = $elem.closest(".tblResults")[0].id;
        var prefix = (idtblresults == "tblResults") ? "" : idtblresults.substring(0, idtblresults.indexOf("tblResults") - 1);
        new FindNavigator({ prefix: prefix }).quickFilter($elem);
    }

    function DeleteFilter(prefix, index) {
        new FindNavigator({ prefix: prefix }).deleteFilter(index);
    }

    function ClearAllFilters(prefix) {
        new FindNavigator({ prefix: prefix }).clearAllFilters();
    }

    function SearchCreate(viewOptions) {
        var findNavigator = new FindNavigator({ prefix: viewOptions.prefix });
        if (empty(viewOptions.prefix)) {
            var viewOptions = findNavigator.viewOptionsForSearchCreate(viewOptions);
            new ViewNavigator(viewOptions).navigate();
        }
        else {
            var viewOptions = findNavigator.viewOptionsForSearchPopupCreate(viewOptions);
            new ViewNavigator(viewOptions).createSave();
        }
    }

    function ToggleSelectAll(prefix) {
        var findNavigator = new FindNavigator({ prefix: prefix }).toggleSelectAll();
    }

    function Sort(evt) {
        var $target = $(evt.target);
        var columnName = $target.find("input:hidden").val();
        if (empty($target[0].id))
            return;

        var searchControlDiv = $target.parents(".searchControl");

        var prefix = searchControlDiv[0].id;
        prefix = prefix.substring(0, prefix.indexOf("divSearchControl"));
        if (prefix.lastIndexOf("_") == prefix.length - 1)
            prefix = prefix.substring(0, prefix.length - 1);
        var findNavigator = new FindNavigator({ prefix: prefix });

        var multiCol = evt.shiftKey;

        findNavigator.setNewSortOrder(columnName, multiCol).search();
    }

    function toggleVisibility(elementId) {
        $('#' + elementId).toggle();
    }

    function toggleFilters(elem) {
        var $elem = $(elem);
        $elem.toggleClass('close').siblings(".filters").toggle();
        if ($elem.hasClass('close')) $elem.html('Mostrar filtros');
        else $elem.html('Ocultar filtros');
        return false;
    }

    var asyncSearchFinished = new Array();
    function SearchOnLoad(prefix) {
        var btnSearchId = prefix.compose("btnSearch");
        var $button = $("#" + btnSearchId);
        var makeSearch = function () {
            if (!asyncSearchFinished[btnSearchId]) {
                $button.click();
                asyncSearchFinished[btnSearchId] = true;
            }
        };

        if ($("#" + prefix.compose("divResults")).is(':visible')) {
            makeSearch();
        }
        else {
            var $tabContainer = $button.parents(".tabs").first();
            if ($tabContainer.length) {
                $tabContainer.find("a").click(
                function () {
                    if ($("#" + prefix.compose("divResults")).is(':visible')) makeSearch();
                });
            } else {
                makeSearch();
            }
        }
    }

}
