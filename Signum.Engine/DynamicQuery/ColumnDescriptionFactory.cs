﻿using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using Signum.Entities;
using Signum.Entities.DynamicQuery;
using Signum.Engine.Properties;
using Signum.Entities.Reflection;
using Signum.Utilities;
using Signum.Utilities.ExpressionTrees;
using System.Reflection;
using System.Linq.Expressions;

namespace Signum.Engine.DynamicQuery
{
    public class ColumnDescriptionFactory
    {
        readonly internal Meta Meta;
        public Func<string> OverrideDisplayName { get; set; }

        public string Name { get; internal set; }
        public Type Type { get; internal set; }

        public string Format { get; set; }
        public string Unit { get; set; }
        public Implementations Implementations { get; set; }

        FieldRoute[] propertyRoutes;
        public FieldRoute[] PropertyRoutes
        {
            get { return propertyRoutes; }
            set
            {
                propertyRoutes = value;
                if (propertyRoutes != null)
                {
                    switch (propertyRoutes[0].FieldRouteType)
                    {
                        case FieldRouteType.LiteEntity:
                        case FieldRouteType.Root:
                            throw new InvalidOperationException("PropertyRoute can not be of RouteType Root");
                        case FieldRouteType.Field:
                            Format = GetFormat(propertyRoutes);
                            Unit = GetUnit(propertyRoutes);
                            Implementations = AggregateImplementations(PropertyRoutes);
                            return;
                        case FieldRouteType.MListItems:
                            Format = Reflector.FormatString(propertyRoutes[0].Type);
                            return;
                    }
                }
            }
        }

        internal static string GetUnit(FieldRoute[] value)
        {
            return value.Select(pr => pr.FieldInfo.SingleAttribute<UnitAttribute>().TryCC(u => u.UnitName)).Distinct().Only();
        }

        internal static string GetFormat(FieldRoute[] value)
        {
            return value.Select(pr => Reflector.FormatString(pr)).Distinct().Only();
        }

        public ColumnDescriptionFactory(int index, MemberInfo mi, Meta meta)
        {
            Name = mi.Name;

            Type = mi.ReturningType();
            Meta = meta;

            if (Type.IsIIdentifiable())
                throw new InvalidOperationException("The Type of column {0} is a subtype of IIdentifiable, use a Lite instead".Formato(mi.MemberName()));

            Type cleanType = Reflector.ExtractLite(Type);
            if (IsEntity && cleanType == null)
                throw new InvalidOperationException("Entity must be a Lite");

            if (meta is CleanMeta && ((CleanMeta)meta).PropertyRoutes.All(pr => pr.FieldRouteType != FieldRouteType.Root))
            {
                PropertyRoutes = ((CleanMeta)meta).PropertyRoutes;
            }
        }

        internal static Implementations AggregateImplementations(FieldRoute[] routes)
        {
            Type type = routes.Select(a => a.Type).Distinct().Single().CleanType();

            return AggregateImplementations(routes.Select(a => a.GetImplementations() ?? new ImplementedByAttribute(a.Type.CleanType())).NotNull(), type);
        }

        private static Implementations AggregateImplementations(IEnumerable<Implementations> collection, Type type)
        {
            if (collection.IsEmpty())
                return null;

            var only = collection.Only();
            if (only != null)
            {
                ImplementedByAttribute ib = only as ImplementedByAttribute;
                if (ib != null && ib.ImplementedTypes.Length == 1 && ib.ImplementedTypes[0] == type)
                    return null;

                return only;
            }
            ImplementedByAttribute iba = (ImplementedByAttribute)collection.FirstOrDefault(a => a.IsByAll);
            if (iba != null)
                return iba;

            var types = collection
                .Cast<ImplementedByAttribute>()
                .SelectMany(ib => ib.ImplementedTypes)
                .Distinct()
                .ToArray();

            if (types.Length == 1 && types[0] == type)
                return null;
         
            return new ImplementedByAttribute(types);
        }

        public string DisplayName()
        {
            if (OverrideDisplayName != null)
                return OverrideDisplayName();

            if (IsEntity)
                return this.Type.NiceName();

            if (propertyRoutes != null && 
                propertyRoutes[0].FieldRouteType == FieldRouteType.Field &&
                propertyRoutes[0].FieldInfo.Name == Name)
            {
                var result = propertyRoutes.Select(pr=>pr.PropertyInfo.NiceName()).Only();
                if (result != null)
                    return result;
            }

            return Name.NiceName();
        }

        public void SetPropertyRoutes<T>(params Expression<Func<T, object>>[] expression)
            where T : IdentifiableEntity
        {
            PropertyRoutes = expression.Select(exp => FieldRoute.Construct(exp)).ToArray();
        }

        public bool IsEntity
        {
            get { return this.Name == ColumnDescription.Entity; }
        }

        public bool IsAllowed()
        {
            return Meta == null || Meta.IsAllowed();
        }

        public ColumnDescription BuildColumnDescription()
        {
            return new ColumnDescription(Name, Type)
            {
                PropertyRoutes = propertyRoutes,
                Implementations = Implementations,

                DisplayName = DisplayName(),
                Format = Format,
                Unit = Unit,
            };
        }

        public Type DefaultEntityType()
        {
            if (Implementations == null)
                return Reflector.ExtractLite(this.Type);

            if (Implementations.IsByAll)
                return null;

            return ((ImplementedByAttribute)Implementations).ImplementedTypes.FirstOrDefault();
        }

        public bool CompatibleWith(Type entityType)
        {
            if (Implementations == null)
                return Reflector.ExtractLite(this.Type) == entityType;

            if (Implementations.IsByAll)
                return true;

            return ((ImplementedByAttribute)Implementations).ImplementedTypes.Contains(entityType);
        }
    }
}
