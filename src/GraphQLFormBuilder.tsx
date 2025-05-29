import React, { useEffect, useState } from "react";
import {
  getIntrospectionQuery,
  buildClientSchema,
  GraphQLSchema,
  GraphQLInputObjectType,
  GraphQLNonNull,
  isInputObjectType,
} from "graphql";
import { request } from "graphql-request";

const GRAPHQL_ENDPOINT = "https://graphqlzero.almansi.me/api";

export default function GraphQLFormBuilder() {
  const [schema, setSchema] = useState<GraphQLSchema | null>(null);
  const [mutations, setMutations] = useState<string[]>([]);
  const [selectedMutation, setSelectedMutation] = useState<string | null>(null);
  const [inputFields, setInputFields] = useState<any[]>([]);
  const [formData, setFormData] = useState<{ [key: string]: any }>({});

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
  };

  const handleChange = (name: string, value: any) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMutation) return;

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

    console.log("Mutation enviada:\n", mutation);

    try {
      const result = await request(GRAPHQL_ENDPOINT, mutation);
      console.log("Resposta:", result);
      alert("Mutation executada com sucesso!");
    } catch (err) {
      console.error("Erro:", err);
      alert("Erro ao executar mutation.");
    }
  };

  return (
    <div className="max-w-screen-xl mx-auto p-6">
      <h2 className="text-2xl font-semibold mb-4">Mutations disponíveis</h2>

      <select
        onChange={(e) => handleMutationSelect(e.target.value)}
        className="mb-6 w-full p-2 border rounded"
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
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mb-6">
            {inputFields.map((field) => (
              <div key={field.name}>
                <label className="block font-medium mb-1 text-left">
                  {field.name.split(".").slice(-1)[0]} ({field.type})
                  {field.isRequired && " *"}
                </label>

                {field.type === "Boolean" ? (
                  <select
                    className="w-full border rounded p-2"
                    onChange={(e) =>
                      handleChange(field.name, e.target.value === "true")
                    }
                  >
                    <option value="">-- Selecione --</option>
                    <option value="true">true</option>
                    <option value="false">false</option>
                  </select>
                ) : (
                  <input
                    type={
                      field.type === "Int" || field.type === "Float"
                        ? "number"
                        : "text"
                    }
                    step={field.type === "Float" ? "any" : undefined}
                    className="w-full border rounded p-2 focus:outline-none focus:ring-2 focus:ring-blue-500 border-gray-300"
                    onChange={(e) => handleChange(field.name, e.target.value)}
                  />
                )}
              </div>
            ))}
          </div>

          <button
            type="submit"
            className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 transition"
          >
            Executar
          </button>
        </form>
      )}
    </div>
  );
}
