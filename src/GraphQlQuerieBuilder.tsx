// GraphQLQueryBuilder.tsx
import React, { useState, useEffect, useMemo } from 'react';
import { GraphQLClient } from 'graphql-request';
import {
  createColumnHelper,
  useReactTable,
  getCoreRowModel,
  ColumnDef,
} from '@tanstack/react-table';

function getClient(endpoint: string, token: string) {
  return new GraphQLClient(endpoint, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
}

type Arg = { name: string; type: string };
type QueryDef = { name: string; args: Arg[] };

const GraphQLQueryBuilder: React.FC = () => {
  const endpoint = process.env.REACT_APP_GRAPHQL_ENDPOINT || 'http://localhost:4000/graphql';

  const [token, setToken] = useState<string>('');
  const [client, setClient] = useState<GraphQLClient>(() =>
    getClient(endpoint, '')
  );

  const [queries, setQueries] = useState<QueryDef[]>([]);
  const [selected, setSelected] = useState<string>('');
  const [argsValues, setArgsValues] = useState<Record<string, string>>({});
  const [dataRows, setDataRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  // Atualiza o client sempre que o token mudar
  useEffect(() => {
    setClient(getClient(endpoint, token));
  }, [endpoint, token]);

  // Introspecção
  useEffect(() => {
    async function loadSchema() {
      const introspectionQuery = `
        query {
          __schema {
            queryType { name }
            types {
              name
              fields {
                name
                args { name type { kind name ofType { kind name } } }
              }
            }
          }
        }
      `;
      try {
        const resp: any = await client.request(introspectionQuery);
        const qt = resp.__schema.queryType.name;
        const type = resp.__schema.types.find((t: any) => t.name === qt);
        const qdefs = (type?.fields || []).map((f: any) => ({
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

  // Reset quando uma nova query é selecionada
  useEffect(() => {
    setArgsValues({});
    setDataRows([]);
    setError(undefined);
  }, [selected]);

  // Executa a query
  const runQuery = async () => {
    const q = queries.find(q => q.name === selected);
    if (!q) return;

    const argsDecl = q.args.map(a => `$${a.name}: ${a.type}`).join(', ');
    const argsPass = q.args.map(a => `${a.name}: $${a.name}`).join(', ');
    const gql = `
      query ${selected}${argsDecl ? `(${argsDecl})` : ''} {
        ${selected}${argsPass ? `(${argsPass})` : ''} {
          ${dataRows[0]
            ? Object.keys(dataRows[0]).join(' ')
            : '__typename'}
        }
      }
    `;
    const vars: any = {};
    q.args.forEach(a => (vars[a.name] = argsValues[a.name]));

    setLoading(true);
    setError(undefined);
    try {
      const resp: any = await client.request(gql, vars);
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

  // Configura colunas da tabela
  const columns = useMemo<ColumnDef<any, any>[]>(() => {
    if (!dataRows.length) return [];
    const helper = createColumnHelper<any>();
    return Object.keys(dataRows[0]).map(key =>
      helper.accessor(key, { header: key })
    );
  }, [dataRows]);

  const table = useReactTable({
    data: dataRows,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div>
      <h2>GraphQL Query Builder</h2>

      <div style={{ marginBottom: 16 }}>
        <label>Bearer Token:</label>
        <input
          type="text"
          value={token}
          onChange={e => setToken(e.target.value)}
          style={{ width: '100%', marginTop: 4 }}
          placeholder="Cole aqui o token e aperte Enter"
          onBlur={() => setClient(getClient(endpoint, token))}
        />
      </div>

      {error && <div style={{ color: 'red' }}>Erro: {error}</div>}

      <div style={{ marginBottom: 16 }}>
        <label>Query:</label>
        <select value={selected} onChange={e => setSelected(e.target.value)}>
          <option value="">— selecione —</option>
          {queries.map(q => (
            <option key={q.name} value={q.name}>
              {q.name}
            </option>
          ))}
        </select>

        <button
          onClick={runQuery}
          disabled={!selected || loading}
          style={{ marginLeft: 8 }}
        >
          {loading ? 'Carregando...' : 'Executar'}
        </button>
      </div>

      {selected && queries.find(q => q.name === selected)?.args.length ? (
        <div style={{ marginBottom: 16 }}>
          <h4>Argumentos</h4>
          {queries.find(q => q.name === selected)!.args.map(arg => (
            <div key={arg.name} style={{ marginTop: 4 }}>
              <label>{arg.name}:</label>
              <input
                type="text"
                value={argsValues[arg.name] || ''}
                onChange={e =>
                  setArgsValues(prev => ({ ...prev, [arg.name]: e.target.value }))
                }
              />
            </div>
          ))}
        </div>
      ) : null}

      {dataRows.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <h4>Resultado</h4>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              {table.getHeaderGroups().map(hg => (
                <tr key={hg.id}>
                  {hg.headers.map(header => (
                    <th
                      key={header.id}
                      style={{
                        borderBottom: '1px solid black',
                        padding: 8,
                        textAlign: 'left',
                        background: '#f9f9f9',
                      }}
                    >
                      {header.isPlaceholder ? null : header.renderHeader()}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map(row => (
                <tr key={row.id}>
                  {row.getVisibleCells().map(cell => (
                    <td
                      key={cell.id}
                      style={{
                        padding: 8,
                        borderBottom: '1px solid #eee',
                        verticalAlign: 'top',
                      }}
                    >
                      {String(cell.getValue())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default GraphQLQueryBuilder;