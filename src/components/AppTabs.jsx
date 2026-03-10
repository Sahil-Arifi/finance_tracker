function AppTabs({ activeTab, onTabChange }) {
  return (
    <div className="app-tabs" role="tablist" aria-label="View">
      <button
        type="button"
        role="tab"
        aria-selected={activeTab === "year"}
        className={`app-tab ${activeTab === "year" ? "app-tab--active" : ""}`}
        onClick={() => onTabChange("year")}
      >
        Year
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={activeTab === "month"}
        className={`app-tab ${activeTab === "month" ? "app-tab--active" : ""}`}
        onClick={() => onTabChange("month")}
      >
        Month
      </button>
    </div>
  );
}

export default AppTabs;
