// GraphQLQueryBuilder.tsx
import React, { useState, useEffect } from 'react';
import { useTable } from 'react-table';
import { GraphQLClient } from 'graphql-request';

function getClient(endpoint: string) {
  return new GraphQLClient(endpoint, {
    headers: {
      // adicione cabeçalhos se necessário, igual ao original
    },
  });
}

type Arg = { name: string; type: string };
type QueryDef = { name: string; args: Arg[] };

const GraphQLQueryBuilder: React.FC = () => {
  const endpoint = process.env.REACT_APP_GRAPHQL_ENDPOINT || 'http://localhost:4000/graphql';
  const client = getClient(endpoint);

  const [queries, setQueries] = useState<QueryDef[]>([]);
  const [selected, setSelected] = useState<string>('');
  const [argsValues, setArgsValues] = useState<Record<string, string>>({});
  const [dataRows, setDataRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    async function loadSchema() {
      const intQuery = `
        query {
          __schema {
            queryType { name }
            types {
              name
              fields {
                name
                args { name type { kind name ofType { kind name ofType { kind name } } } }
              }
            }
          }
        }
      `;
      try {
        const resp = await client.request<any>(intQuery);
        const qt = resp.__schema.queryType.name;
        const qfs = resp.__schema.types
          .find((t: any) => t.name === qt)?.fields || [];
        const qdefs: QueryDef[] = qfs.map((f: any) => ({
          name: f.name,
          args: f.args.map((a: any) => ({
            name: a.name,
            type: a.type.name || a.type.ofType?.name || 'String',
          })),
        }));
        setQueries(qdefs);
      } catch (e: any) {
        setError(e.message);
      }
    }
    loadSchema();
  }, [client]);

  useEffect(() => {
    setArgsValues({});
    setDataRows([]);
    setError(undefined);
  }, [selected]);

  const runQuery = async () => {
    const q = queries.find(q => q.name === selected);
    if (!q) return;

    const argsDecl = q.args.map(a => `$${a.name}: ${a.type}`).join(', ');
    const argsPass = q.args.map(a => `${a.name}: $${a.name}`).join(', ');
    const gql = `
      query ${selected}${argsDecl ? `(${argsDecl})` : ''} {
        ${selected}${argsPass ? `(${argsPass})` : ''} {
          __typename
          ... on Object { ${/* pegamos todos campos na primeira camada */''} __typename }
          # Note: pode expandir introspecção para extrair campos reais
        }
      }
    `;
    const vars: any = {};
    q.args.forEach(a => (vars[a.name] = argsValues[a.name]));

    setLoading(true);
    setError(undefined);
    try {
      const resp = await client.request<any>(gql, vars);
      const result = resp[selected];
      const rows = Array.isArray(result) ? result : result ? [result] : [];
      setDataRows(rows);
    } catch (e: any) {
      setError(e.message);
      setDataRows([]);
    } finally {
      setLoading(false);
    }
  };

  const columns = React.useMemo(() => {
    if (!dataRows.length) return [];
    return Object.keys(dataRows[0]).map(key => ({
      Header: key,
      accessor: key,
    }));
  }, [dataRows]);

  const table = useTable({ columns, data: dataRows });

  return (
    <div>
      <h2>GraphQL Query Builder</h2>
      {error && <div style={{ color: 'red' }}>Erro: {error}</div>}

      <div>
        <label>Query:</label>
        <select value={selected} onChange={e => setSelected(e.target.value)}>
          <option value="">— selecione —</option>
          {queries.map(q => (
            <option key={q.name} value={q.name}>{q.name}</option>
          ))}
        </select>
        <button onClick={runQuery} disabled={!selected || loading} style={{ marginLeft: 8 }}>
          {loading ? 'Carregando...' : 'Executar'}
        </button>
      </div>

      {selected && queries.find(q => q.name === selected)?.args.length ? (
        <div style={{ marginTop: 16 }}>
          <h4>Argumentos</h4>
          {queries.find(q => q.name === selected)!.args.map(arg => (
            <div key={arg.name}>
              <label>{arg.name}:</label>
              <input
                type="text"
                value={argsValues[arg.name] || ''}
                onChange={e => setArgsValues(prev => ({ ...prev, [arg.name]: e.target.value }))}
              />
            </div>
          ))}
        </div>
      ) : null}

      {dataRows.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <h4>Resultado</h4>
          <table {...table.getTableProps()} style={{ border: '1px solid #ddd' }}>
            <thead>
              {table.headerGroups.map((hg) => (
                <tr {...hg.getHeaderGroupProps()}>
                  {hg.headers.map(col => (
                    <th {...col.getHeaderProps()} style={{ padding: 8, background: '#f0f0f0' }}>
                      {col.render('Header')}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody {...table.getTableBodyProps()}>
              {table.rows.map(row => {
                table.prepareRow(row);
                return (
                  <tr {...row.getRowProps()}>
                    {row.cells.map(cell => (
                      <td {...cell.getCellProps()} style={{ padding: 8, border: '1px solid #ccc' }}>
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

export default GraphQLQueryBuilder;