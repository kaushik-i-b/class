export default function HeatBadge({ tier, score }) {
  const label = tier || 'cold';
  return (
    <span className={`badge ${label}`}>
      {label}
      {typeof score === 'number' ? ` · ${score}` : ''}
    </span>
  );
}
