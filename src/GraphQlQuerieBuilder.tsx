// GraphQLQueryBuilder.tsx
import React, { useState, useEffect, useMemo } from 'react';
import { useTable } from 'react-table';

type IntrospectionQuery = {
  data: {
    __schema: {
      queryType: { name: string };
      types: Array<{
        kind: string;
        name: string;
        fields?: Array<{
          name: string;
          args: Array<{ name: string; type: any }>;
          type: any;
        }>;
      }>;
    };
  };
};

type QueryDefinition = {
  name: string;
  args: Array<{ name: string; type: string }>;
};

type Props = {
  endpoint: string;
};

export const GraphQLQueryBuilder: React.FC<Props> = ({ endpoint }) => {
  const [queries, setQueries] = useState<QueryDefinition[]>([]);
  const [selectedQuery, setSelectedQuery] = useState<string>('');
  const [argsValues, setArgsValues] = useState<Record<string, any>>({});
  const [resultData, setResultData] = useState<any[]>([]);

  useEffect(() => {
    // 1. introspecção do schema
    async function fetchSchema() {
      const introspectionQuery = `
        query Introspection {
          __schema {
            queryType { name }
            types {
              kind
              name
              fields {
                name
                args { name type { kind name ofType { kind name } } }
                type { kind name ofType { kind name } }
              }
            }
          }
        }
      `;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: introspectionQuery }),
      });
      const json: IntrospectionQuery = await res.json();
      const queryTypeName = json.data.__schema.queryType.name;

      const qDefs: QueryDefinition[] = [];

      for (const type of json.data.__schema.types) {
        if (type.name === queryTypeName && type.fields) {
          for (const field of type.fields) {
            const args = field.args.map(arg => ({
              name: arg.name,
              type: arg.type.name || arg.type.ofType?.name || 'String',
            }));
            qDefs.push({ name: field.name, args });
          }
        }
      }
      setQueries(qDefs);
    }

    fetchSchema();
  }, [endpoint]);

  useEffect(() => {
    // Zera argumentos e resultado ao trocar a query
    setArgsValues({});
    setResultData([]);
  }, [selectedQuery]);

  const executeQuery = async () => {
    const q = queries.find(q => q.name === selectedQuery);
    if (!q) return;

    const argsDef = q.args;
    const argsStr = argsDef.length
      ? '(' +
        argsDef.map(a => `$${a.name}: ${a.type}`).join(', ') +
        ')'
      : '';

    const inputAssignments = argsDef.length
      ? '(' +
        argsDef.map(a => `${a.name}: $${a.name}`).join(', ') +
        ')'
      : '';

    const gql = `
      query RunQuery${argsStr} {
        ${selectedQuery}${inputAssignments} {
          __typename
          ... on Node { id }
          ... on Error { message }
          # Suporte simplificado: renderiza campos da primeira camada
        }
      }
    `;

    const variables: Record<string, any> = {};
    for (const a of argsDef) {
      variables[a.name] = argsValues[a.name];
    }

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: gql, variables }),
    });
    const { data } = await res.json();

    let rows: any[] = [];
    if (Array.isArray(data[selectedQuery])) {
      rows = data[selectedQuery];
    } else if (data[selectedQuery]) {
      rows = [data[selectedQuery]];
    }
    setResultData(rows);
  };

  const columns = useMemo(() => {
    if (!resultData || resultData.length === 0) return [];
    const firstRow = resultData[0];
    return Object.keys(firstRow).map(k => ({
      Header: k,
      accessor: k,
    }));
  }, [resultData]);

  const tableInstance = useTable({ columns, data: resultData });

  return (
    <div>
      <h3>GraphQL Query Builder</h3>
      <div>
        <label>Query: </label>
        <select
          value={selectedQuery}
          onChange={e => setSelectedQuery(e.target.value)}
        >
          <option value="">-- selecione --</option>
          {queries.map(q => (
            <option key={q.name} value={q.name}>
              {q.name}
            </option>
          ))}
        </select>
      </div>

      {selectedQuery && (
        <div style={{ marginTop: 16 }}>
          <h4>Parâmetros</h4>
          {queries
            .find(q => q.name === selectedQuery)!
            .args.map(arg => (
              <div key={arg.name}>
                <label>{arg.name}: </label>
                <input
                  type="text"
                  value={argsValues[arg.name] ?? ''}
                  onChange={e =>
                    setArgsValues(prev => ({
                      ...prev,
                      [arg.name]: e.target.value,
                    }))
                  }
                />
              </div>
            ))}
          <button onClick={executeQuery} style={{ marginTop: 8 }}>
            Executar
          </button>
        </div>
      )}

      {resultData && resultData.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <h4>Resultado</h4>
          <table {...tableInstance.getTableProps()} style={{ border: 'solid 1px gray' }}>
            <thead>
              {tableInstance.headerGroups.map(headerGroup => (
                <tr {...headerGroup.getHeaderGroupProps()}>
                  {headerGroup.headers.map(column => (
                    <th
                      {...column.getHeaderProps()}
                      style={{ borderBottom: 'solid 3px red', background: 'aliceblue', padding: '5px' }}
                    >
                      {column.render('Header')}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody {...tableInstance.getTableBodyProps()}>
              {tableInstance.rows.map(row => {
                tableInstance.prepareRow(row);
                return (
                  <tr {...row.getRowProps()}>
                    {row.cells.map(cell => (
                      <td
                        {...cell.getCellProps()}
                        style={{ padding: '5px', border: 'solid 1px gray' }}
                      >
                        {String(cell.value)}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};