import React, { useEffect, useState } from "react";
import {
  getIntrospectionQuery,
  buildClientSchema,
  GraphQLSchema,
  GraphQLEnumType,
  GraphQLInputObjectType,
  GraphQLNonNull,
  isInputObjectType,
  isEnumType,
} from "graphql";
import { request } from "graphql-request";

const GRAPHQL_ENDPOINT = "https://graphqlzero.almansi.me/api";

export default function GraphQLFormBuilder() {
  const [schema, setSchema] = useState<GraphQLSchema | null>(null);
  const [mutations, setMutations] = useState<string[]>([]);
  const [selectedMutation, setSelectedMutation] = useState<string | null>(null);
  const [inputFields, setInputFields] = useState<any[]>([]);
  const [formData, setFormData] = useState<{ [key: string]: any }>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [enumsMap, setEnumsMap] = useState<Record<string, string[]>>({});
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  useEffect(() => {
    const fetchSchema = async () => {
      const introspection = await request(
        GRAPHQL_ENDPOINT,
        getIntrospectionQuery()
      );
      const builtSchema = buildClientSchema(introspection as any);
      setSchema(builtSchema);

      const mutationType = builtSchema.getMutationType();
      if (mutationType) {
        const fields = mutationType.getFields();
        setMutations(Object.keys(fields));
      }

      const allTypes = builtSchema.getTypeMap();
      const enumTypes: Record<string, string[]> = {};
      Object.values(allTypes).forEach((type) => {
        if (isEnumType(type)) {
          enumTypes[type.name] = type.getValues().map((v) => v.name);
        }
      });
      setEnumsMap(enumTypes);
    };

    fetchSchema();
  }, []);

  const unwrapType = (type: any): any => {
    return type.ofType ? unwrapType(type.ofType) : type;
  };

  const extractFieldsRecursively = (
    prefix: string,
    inputType: GraphQLInputObjectType
  ): any[] => {
    const fields = inputType.getFields();
    const extracted: any[] = [];

    Object.values(fields).forEach((field) => {
      const fullName = `${prefix}.${field.name}`;
      const unwrapped = unwrapType(field.type);

      if (isInputObjectType(unwrapped)) {
        extracted.push(...extractFieldsRecursively(fullName, unwrapped));
      } else {
        extracted.push({
          name: fullName,
          type: unwrapped.name,
          isRequired: field.type instanceof GraphQLNonNull,
        });
      }
    });

    return extracted;
  };

  const handleMutationSelect = (mutationName: string) => {
    if (!schema) return;

    const mutation = schema.getMutationType()?.getFields()[mutationName];
    if (!mutation) return;

    const formFields: any[] = [];

    mutation.args.forEach((arg) => {
      const baseType = unwrapType(arg.type);

      if (isInputObjectType(baseType)) {
        formFields.push(...extractFieldsRecursively(arg.name, baseType));
      } else {
        formFields.push({
          name: arg.name,
          type: baseType.name,
          isRequired: arg.type instanceof GraphQLNonNull,
        });
      }
    });

    setInputFields(formFields);
    setSelectedMutation(mutationName);
    setFormData({});
    setErrors({});
  };

  const handleChange = (name: string, value: any) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
    setErrors((prev) => ({ ...prev, [name]: "" }));
  };

  const buildNestedObject = (entries: [string, any][]) => {
    const result: any = {};
    for (const [key, value] of entries) {
      const parts = key.split(".");
      let current = result;
      parts.forEach((part, index) => {
        if (index === parts.length - 1) {
          current[part] = value;
        } else {
          current[part] = current[part] || {};
          current = current[part];
        }
      });
    }
    return result;
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    inputFields.forEach((field) => {
      const value = formData[field.name];
      if (field.isRequired && (value === undefined || value === "")) {
        newErrors[field.name] = "Campo obrigatório";
      }
    });
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMutation) return;

    if (!validateForm()) return;

    const nested = buildNestedObject(Object.entries(formData));

    const argStrings = Object.entries(nested)
      .map(
        ([argName, val]) =>
          `${argName}: ${JSON.stringify(val).replace(/"([^"]+)":/g, "$1:")}`
      )
      .join(", ");

    const mutation = `
      mutation {
        ${selectedMutation}(${argStrings}) {
          id
        }
      }
    `;

    setIsSubmitting(true);
    try {
      const result = await request(GRAPHQL_ENDPOINT, mutation);
      console.log("Resposta:", result);
      // exibir toast ou status se quiser
    } catch (err) {
      console.error("Erro:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderField = (field: any) => {
    const fieldKey = field.name;
    const label = fieldKey.split(".").slice(-1)[0];
    const enumOptions = enumsMap[field.type];
    const error = errors[fieldKey];

    const inputClass = `w-full border rounded p-2 ${
      error ? "border-red-500" : ""
    }`;

    return (
      <div key={fieldKey} className="text-left">
        <label className="block font-medium mb-1 text-left">
          {label} ({field.type}){field.isRequired && " *"}
        </label>

        {enumOptions ? (
          <select
            className={inputClass}
            value={formData[fieldKey] || ""}
            onChange={(e) => handleChange(fieldKey, e.target.value)}
          >
            <option value="">-- Selecione --</option>
            {enumOptions.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        ) : field.type === "Boolean" ? (
          <select
            className={inputClass}
            value={formData[fieldKey] || ""}
            onChange={(e) => handleChange(fieldKey, e.target.value === "true")}
          >
            <option value="">-- Selecione --</option>
            <option value="true">true</option>
            <option value="false">false</option>
          </select>
        ) : (
          <input
            type={
              field.type === "Int" || field.type === "Float" ? "number" : "text"
            }
            step={field.type === "Float" ? "any" : undefined}
            value={formData[fieldKey] || ""}
            className={inputClass}
            onChange={(e) => handleChange(fieldKey, e.target.value)}
          />
        )}

        {error && <p className="text-red-600 text-sm mt-1">{error}</p>}
      </div>
    );
  };

  return (
    <div className="max-w-screen-xl mx-auto p-6 text-left">
      <h2 className="text-2xl font-semibold mb-4 text-left">
        Mutations disponíveis
      </h2>

      <select
        onChange={(e) => handleMutationSelect(e.target.value)}
        className="mb-6 w-full p-2 border rounded text-left"
      >
        <option value="">-- Selecione uma mutation --</option>
        {mutations.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>

      {inputFields.length > 0 && (
        <form onSubmit={handleSubmit}>
          {Object.entries(
            inputFields.reduce<Record<string, any[]>>((acc, field) => {
              const path = field.name.replace(/^input\./, "");
              const parts = path.split(".");
              const prefix =
                parts.length > 1 ? parts.slice(0, -1).join(".") : "";
              if (!acc[prefix]) acc[prefix] = [];
              acc[prefix].push(field);
              return acc;
            }, {})
          ).map(([prefix, fields]) => (
            <fieldset
              key={prefix}
              className="mb-6 border border-gray-300 rounded p-4 text-left"
            >
              {prefix && (
                <legend className="text-lg font-semibold px-2 text-gray-700 text-left">
                  {prefix}
                </legend>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mt-2 text-left">
                {fields.map(renderField)}
              </div>
            </fieldset>
          ))}

          <button
            type="submit"
            disabled={isSubmitting}
            className={`px-6 py-2 rounded transition text-left mt-4 ${
              isSubmitting
                ? "bg-gray-400 cursor-not-allowed text-white"
                : "bg-blue-600 hover:bg-blue-700 text-white"
            }`}
          >
            {isSubmitting ? "Enviando..." : "Executar"}
          </button>
        </form>
      )}
    </div>
  );
}
