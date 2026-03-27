import { getCategoryIconName } from "../utils/categoryIcons";

export default function CategoryIcon({ category, type = "expense", className = "", title }) {
  const icon = getCategoryIconName(category, type);
  return (
    <span className={`category-txn-icon ${className}`.trim()} title={title} aria-hidden="true">
      <span className="material-symbols-outlined">{icon}</span>
    </span>
  );
}
