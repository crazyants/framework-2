﻿using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using Signum.Utilities.Reflection;
using System.Linq.Expressions;
using System.Reflection;
using Signum.Utilities;
using Signum.Entities.Properties;
using Signum.Entities.Reflection;
using Signum.Utilities.ExpressionTrees; 
using System.Text.RegularExpressions;

namespace Signum.Entities.DynamicQuery
{
    [Serializable]
    public abstract class QueryToken : IEquatable<QueryToken>
    {
        public abstract override string ToString();
        public abstract string NiceName();
        public abstract string Format { get; }
        public abstract string Unit { get; }
        public abstract Type Type { get; }
        public abstract string Key { get; }
        protected abstract QueryToken[] SubTokensInternal();

        public Expression BuildExpression(BuildExpressionContext context)
        {
            Expression result;
            if (context.Replacemens != null && context.Replacemens.TryGetValue(this, out result))
                return result;

            return BuildExpressionInternal(context); 
        }

        protected abstract Expression BuildExpressionInternal(BuildExpressionContext context);

        public abstract FieldRoute GetPropertyRoute();
        public abstract Implementations Implementations();
        public abstract bool IsAllowed();

        public abstract QueryToken Clone();

        public QueryToken Parent { get; private set; }

        public QueryToken(QueryToken parent)
        {
            this.Parent = parent;
        }

        public static QueryToken NewColumn(ColumnDescription column)
        {
            return new ColumnToken(column);
        }

        public QueryToken[] SubTokens()
        {
            var result = this.SubTokensInternal();

            if (result == null)
                return null;

            return result.Where(t => t.IsAllowed()).ToArray();
        }

        protected QueryToken[] SubTokensBase(Type type, Implementations implementations)
        {
            if (type.UnNullify() == typeof(DateTime))
            {
                return DateTimeProperties(this, DateTimePrecision.Milliseconds);
            }

            Type cleanType = Reflector.ExtractLite(type) ?? type;
            if (cleanType.IsIIdentifiable())
            {
                if (implementations != null)
                {
                    if (implementations.IsByAll)
                        return null; // new[] { EntityPropertyToken.IdProperty(this) };

                    return ((ImplementedByAttribute)implementations).ImplementedTypes.Select(t => (QueryToken)new AsTypeToken(this, t)).ToArray();

                    //return new[] { EntityPropertyToken.IdProperty(this), EntityPropertyToken.ToStrProperty(this) }
                    //    .Concat(asPropesties).Concat(EntityProperties(cleanType)).ToArray();
                }

                return new[] { EntityPropertyToken.IdProperty(this), EntityPropertyToken.ToStrProperty(this) }
                    .Concat(EntityProperties(cleanType)).Concat(OnEntityExtension(cleanType, this)).ToArray();
            }
            
            if (cleanType.IsEmbeddedEntity())
            {
                return EntityProperties(cleanType).ToArray();
            }

            if(type != typeof(string) && type.ElementType() != null)
            {
                return CollectionProperties(this);
            }

            return null;
        }

        public static IEnumerable<QueryToken> OnEntityExtension(Type type, QueryToken parent)
        {
            if (EntityExtensions == null)
                throw new InvalidOperationException("QuertToken.EntityExtensions function not set");

            return EntityExtensions(type, parent);
        }

        public static Func<Type, QueryToken, IEnumerable<QueryToken>>  EntityExtensions;
        

        public static QueryToken[] DateTimeProperties(QueryToken parent, DateTimePrecision precission)
        {
            string utc = TimeZoneManager.Mode == TimeZoneMode.Utc ? "Utc - " : "";

            return new QueryToken[]
            {
                new NetPropertyToken(parent, ReflectionTools.GetPropertyInfo((DateTime dt)=>dt.Year), utc + Resources.Year), 
                new NetPropertyToken(parent, ReflectionTools.GetPropertyInfo((DateTime dt)=>dt.Month), utc + Resources.Month), 
                new MonthStartToken(parent), 
                new NetPropertyToken(parent, ReflectionTools.GetPropertyInfo((DateTime dt)=>dt.Day), utc + Resources.Day),
                new DateToken(parent), 
                precission < DateTimePrecision.Hours ? null: new NetPropertyToken(parent, ReflectionTools.GetPropertyInfo((DateTime dt)=>dt.Hour), utc + Resources.Hour), 
                precission < DateTimePrecision.Minutes ? null: new NetPropertyToken(parent, ReflectionTools.GetPropertyInfo((DateTime dt)=>dt.Minute), utc + Resources.Minute), 
                precission < DateTimePrecision.Seconds ? null: new NetPropertyToken(parent, ReflectionTools.GetPropertyInfo((DateTime dt)=>dt.Second), utc + Resources.Second), 
                precission < DateTimePrecision.Milliseconds? null: new NetPropertyToken(parent, ReflectionTools.GetPropertyInfo((DateTime dt)=>dt.Millisecond), utc + Resources.Millisecond), 
            }.NotNull().ToArray();
        }

        public static QueryToken[] CollectionProperties(QueryToken parent)
        {
            return new QueryToken[]
            {
                new CountToken(parent),
                parent.HasAllOrAny() ?null: new CollectionElementToken(parent, CollectionElementType.Element),
                new CollectionElementToken(parent, CollectionElementType.Any),
                new CollectionElementToken(parent, CollectionElementType.All),
            }.NotNull().ToArray();
        }

        public virtual bool HasAllOrAny()
        {
            return Parent != null && Parent.HasAllOrAny(); 
        }

        IEnumerable<QueryToken> EntityProperties(Type type)
        {
            return Reflector.PublicInstancePropertiesInOrder(type)
                  .Where(p => Reflector.QueryableProperty(type, p))
                  .Select(p => (QueryToken)new EntityPropertyToken(this, p)).OrderBy(a => a.ToString());
        }

        static MethodInfo miToLite = ReflectionTools.GetMethodInfo((IdentifiableEntity ident) => ident.ToLite()).GetGenericMethodDefinition();
        protected static Expression ExtractEntity(Expression expression, bool idAndToStr)
        {
            if (Reflector.ExtractLite(expression.Type) != null)
            {
                MethodCallExpression mce = expression as MethodCallExpression;
                if (mce != null && mce.Method.IsInstantiationOf(miToLite))
                    return mce.Arguments[0];

                if (!idAndToStr)
                    return Expression.Property(expression, "Entity");
            }
            return expression;
        }

        protected static Expression BuildLite(Expression expression)
        {
            if (Reflector.IsIIdentifiable(expression.Type))
                return Expression.Call(miToLite.MakeGenericMethod(expression.Type), expression);

            return expression;
        }

        public static Type BuildLite(Type type)
        {
            if (Reflector.IsIIdentifiable(type))
                return Reflector.GenerateLite(type);

            return type;
        }

        public string FullKey()
        {
            if (Parent == null)
                return Key;

            return Parent.FullKey() + "." + Key;
        }

        public virtual QueryToken MatchPart(string key)
        {
            return key == Key ? this : null;
        }

        public override bool Equals(object obj)
        {
            return obj is QueryToken && obj.GetType() == this.GetType() && Equals((QueryToken)obj);
        }

        public bool Equals(QueryToken other)
        {
            return other != null && other.FullKey() == this.FullKey();
        }

        public override int GetHashCode()
        {
            return this.FullKey().GetHashCode();
        }
    }


    public class BuildExpressionContext
    {
        public BuildExpressionContext(Type tupleType, ParameterExpression parameter, Dictionary<QueryToken, Expression> replacemens)
        {
            this.Parameter = parameter;
            this.Replacemens = replacemens; 
        }

        public readonly Type TupleType;
        public readonly ParameterExpression Parameter;
        public readonly Dictionary<QueryToken, Expression> Replacemens; 
    }
}
