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

  const handleMutationSelect = (mutationName: string) => {
    if (!schema) return;

    const mutation = schema.getMutationType()?.getFields()[mutationName];
    if (!mutation) return;

    const formFields: any[] = [];

    mutation.args.forEach((arg) => {
      const baseType = unwrapType(arg.type);

      // Se for input object
      if (isInputObjectType(baseType)) {
        const nestedFields = Object.values(baseType.getFields()).map((f) => {
          const fBase = unwrapType(f.type);
          return {
            name: `${arg.name}.${f.name}`,
            type: fBase.name,
            isRequired: f.type instanceof GraphQLNonNull,
          };
        });
        formFields.push(...nestedFields);
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

  const handleChange = (name: string, value: string) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMutation) return;

    const inputBlocks: { [key: string]: string[] } = {};

    for (const [key, value] of Object.entries(formData)) {
      const [inputName, fieldName] = key.split(".");

      const val = isNaN(Number(value)) ? `"${value}"` : value;

      if (fieldName) {
        inputBlocks[inputName] ??= [];
        inputBlocks[inputName].push(`${fieldName}: ${val}`);
      } else {
        inputBlocks[key] = [`${val}`];
      }
    }

    const inputStrings = Object.entries(inputBlocks)
      .map(([argName, entries]) => {
        const content = entries.join(", ");
        return `${argName}: { ${content} }`;
      })
      .join(", ");

    const mutation = `
      mutation {
        ${selectedMutation}(${inputStrings}) {
          id
        }
      }
    `;

    console.log("Mutation enviada:", mutation);

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
    <div style={{ padding: "2rem" }}>
      <h2>Mutations disponíveis</h2>

      <select onChange={(e) => handleMutationSelect(e.target.value)}>
        <option value="">-- Selecione uma mutation --</option>
        {mutations.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>

      {inputFields.length > 0 && (
        <form onSubmit={handleSubmit} style={{ marginTop: "2rem" }}>
          {inputFields.map((field) => (
            <div key={field.name} style={{ marginBottom: "1rem" }}>
              <label>
                {field.name} ({field.type})
              </label>
              <input
                type={field.type === "Int" ? "number" : "text"}
                onChange={(e) => handleChange(field.name, e.target.value)}
              />
            </div>
          ))}
          <button type="submit">Executar</button>
        </form>
      )}
    </div>
  );
}
