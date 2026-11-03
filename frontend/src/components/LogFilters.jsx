import "../styles/LogFilters.css";

function LogFilters({ filter, setFilter }) {
  const types = ["ALL", "INFO", "WARN", "ERROR", "DEBUG"];

  return (
    <div className="filters">
      {types.map((type) => (
        <button
          key={type}
          className={`filter-btn${filter === type ? " active" : ""}`}
          data-type={type}
          onClick={() => setFilter(type)}
        >
          {type}
        </button>
      ))}
    </div>
  );
}

export default LogFilters;