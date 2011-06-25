﻿using System;
using System.Collections.Generic;
using Signum.Entities;
using Signum.Entities.Basics;
using Signum.Utilities;
using System.Web.Mvc;
using Signum.Web.Properties;
using Signum.Web.Controllers;

namespace Signum.Web
{
    public static class NoteWidgetHelper
    {
        public static Func<IdentifiableEntity, INoteDN> CreateNote { get; set; }
        public static Type Type { get; set; }
        public static string NotesQueryColumn { get; set; }

        static object notesQuery; 
        public static object NotesQuery 
        {
            get { return notesQuery ?? Type; }
            set { notesQuery = value; }
        }

        public static int CountNotes(IdentifiableEntity identifiable)
        { 
            return Navigator.QueryCount(new CountOptions(NotesQuery)
            {
                FilterOptions = { new FilterOption(NotesQueryColumn, identifiable) }
            });
        }

        public static WidgetItem CreateWidget(HtmlHelper helper, IdentifiableEntity identifiable, string partialViewName, string prefix)
        {
            if (identifiable == null || identifiable.IsNew || identifiable is INoteDN)
                return null;

            JsFindOptions foptions = new JsFindOptions
            {
                FindOptions = new FindOptions
                {
                    QueryName = NotesQuery,
                    Create = false,
                    SearchOnLoad = true,
                    FilterMode = FilterMode.AlwaysHidden,
                    FilterOptions = { new FilterOption( NotesQueryColumn, identifiable.ToLite()) }
                }
            };

            JsViewOptions voptions = new JsViewOptions
            {
                Type = Type.Name,
                Prefix = prefix,
                ControllerUrl = RouteHelper.New().Action("CreateNote", "Widgets"),
                RequestExtraJsonData = "function(){{ return {{ {0}: new SF.RuntimeInfo('{1}').find().val() }}; }}".Formato(EntityBaseKeys.RuntimeInfo, prefix),
                OnOkClosed = new JsFunction() { "SF.Widgets.onNoteCreated('{0}','{1}')".Formato(RouteHelper.New().Action<WidgetsController>(wc => wc.NotesCount()), prefix) }
            };

            HtmlStringBuilder content = new HtmlStringBuilder();
            using (content.Surround(new HtmlTag("ul").Class("sf-menu-button sf-widget-content sf-notes")))
            {
                using (content.Surround(new HtmlTag("li").Class("sf-note")))
                {
                    content.AddLine(new HtmlTag("a")
                        .Class("sf-notes-view")
                        .Attr("onclick", new JsFindNavigator(foptions).openFinder().ToJS())
                        .InnerHtml(Resources.ViewNotes.EncodeHtml())
                        .ToHtml());
                }

                using (content.Surround(new HtmlTag("li").Class("sf-note")))
                {
                    content.AddLine(new HtmlTag("a")
                       .Class("sf-notes-create")
                       .Attr("onclick", new JsViewNavigator(voptions).createSave(RouteHelper.New().SignumAction("TrySavePartial")).ToJS())
                       .InnerHtml(Resources.CreateNote.EncodeHtml())
                       .ToHtml());
                }
            }

            HtmlStringBuilder label = new HtmlStringBuilder();
            using (label.Surround(new HtmlTag("a").Class("sf-widget-toggler sf-notes-toggler").Attr("title", Resources.Notes)))
            {
                label.Add(new HtmlTag("span")
                    .Class("ui-icon ui-icon-pin-w")
                    .InnerHtml(Resources.Notes.EncodeHtml())
                    .ToHtml());

                int count = CountNotes(identifiable);

                label.Add(new HtmlTag("span")
                    .Class("sf-widget-count")
                    .SetInnerText(count.ToString())
                    .ToHtml());
            }

            return new WidgetItem
            {
                Id = TypeContextUtilities.Compose(prefix, "notesWidget"),
                Label = label.ToHtml(),
                Content = content.ToHtml()
            };
        }
    }
}
