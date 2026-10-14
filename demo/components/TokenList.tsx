import { isSwatchColour, type TokenEntry, type TokenReferenceGroup } from '../utils/tokens';

// The token reference's groups (P-25 S6b). Each token is a term with its purpose and its values:
// one per theme for the colour tokens, and one for all themes otherwise. Values are the
// stylesheet's own text, so nothing here formats or rounds them.

function Value({ label, value }: { label: string; value: string | undefined }) {
  return (
    <span className="d-token__value">
      <span className="d-token__theme">{label}</span>{' '}
      {isSwatchColour(value) && (
        <span className="d-token__swatch" style={{ background: value }} aria-hidden="true" />
      )}
      <code>{value ?? 'not set'}</code>
    </span>
  );
}

const Values = ({ token }: { token: TokenEntry }) =>
  token.dark === undefined ? (
    <Value label="All themes" value={token.light} />
  ) : (
    <>
      <Value label="Light" value={token.light} /> <Value label="Dark" value={token.dark} />
    </>
  );

export function TokenList({ groups }: { groups: readonly TokenReferenceGroup[] }) {
  return (
    <div className="d-token-groups">
      {groups.map(group => (
        <section
          key={group.id}
          className="d-token-group"
          aria-labelledby={`tokens-${group.id}-heading`}
        >
          <h4 id={`tokens-${group.id}-heading`} className="d-token-group__title">
            {group.title}
          </h4>
          <p className="d-token-group__summary">{group.summary}</p>
          <dl className="d-token-list">
            {group.tokens.map(token => (
              <div key={token.name} className="d-token">
                <dt className="d-token__name">
                  <code>{token.name}</code>
                </dt>
                <dd className="d-token__purpose">
                  {token.purpose}
                  {token.note !== undefined && <span className="d-token__note"> {token.note}</span>}
                </dd>
                <dd className="d-token__values">
                  <Values token={token} />
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}
