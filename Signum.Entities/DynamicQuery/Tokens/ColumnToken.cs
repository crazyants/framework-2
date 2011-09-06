﻿using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using Signum.Utilities;
using Signum.Entities.Reflection;
using System.Linq.Expressions;

namespace Signum.Entities.DynamicQuery
{

    [Serializable]
    public class ColumnToken : QueryToken
    {
        public ColumnDescription Column { get; private set; }

        internal ColumnToken(ColumnDescription column)
            : base(null)
        {
            if (column == null)
                throw new ArgumentNullException("column");

            this.Column = column;
        }

        public override string Key
        {
            get { return Column.Name; }
        }

        public override string ToString()
        {
            return Column.ToString();
        }

        public override Type Type
        {
            get { return Column.Type; }
        }

        public override string Format
        {
            get { return Column.Format; }
        }

        public override string Unit
        {
            get { return Column.Unit; }
        }

        protected override Expression BuildExpressionInternal(BuildExpressionContext context)
        {
            throw new InvalidOperationException("BuildExpressionInternal not supported for ColumnToken");
        }

        protected override QueryToken[] SubTokensInternal()
        {
            if (Column.Type.UnNullify() == typeof(DateTime))
            {
                if (Column.PropertyRoutes != null)
                {
                    DateTimePrecision? precission =
                        Column.PropertyRoutes.Select(pr => Validator.GetOrCreatePropertyPack(pr.Parent.Type, pr.FieldInfo.Name)
                        .Validators.OfType<DateTimePrecissionValidatorAttribute>().SingleOrDefault())
                        .Select(dtp => dtp.TryCS(d => d.Precision)).Distinct().Only();

                    if (precission != null)
                        return DateTimeProperties(this, precission.Value);
                }

                if (Column.Format == "d")
                    return DateTimeProperties(this, DateTimePrecision.Days);

            }

            return SubTokensBase(Column.Type, Column.Implementations);
        }

        public override Implementations Implementations()
        {
            return Column.Implementations;
        }

        public override bool IsAllowed()
        {
            return true;  //If it wasn't, sould be filtered before
        }

        public override FieldRoute GetPropertyRoute()
        {
            if (Column.PropertyRoutes != null)
                return Column.PropertyRoutes[0]; //HACK: compatibility with IU entitiy elements

            Type type = Reflector.ExtractLite(Type);
            if (type != null && typeof(IdentifiableEntity).IsAssignableFrom(type))
                return FieldRoute.Root(type);

            return null;
        }

        public override string NiceName()
        {
            return Column.DisplayName;
        }

        public override QueryToken Clone()
        {
            return new ColumnToken(Column);
        }
    }
}
