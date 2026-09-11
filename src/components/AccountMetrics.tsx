import "./AccountMetrics.css";

type Metric = {
  name: string;
  value: string;
};

const metrics: Metric[] = [
  { name: "Balance", value: "$ 10,099,421.12" },
  { name: "Equity", value: "$ 10,100,184.92" },
  { name: "Net Liquidation", value: "$ 10,099,803.02" },
  { name: "Available Funds", value: "$ 10,099,803.02" },
  { name: "Stock Buying Power", value: "$ 763.80" },
  { name: "Market Value Long", value: "$ 763.80" },
  { name: "Stock Value Long", value: "$ 763.80" },
  { name: "Stock Value Short", value: "$ 0.00" },
  { name: "Market Value Short", value: "$ 0.00" },
  { name: "Margin Used", value: "$ 0.00" },
];

export function AccountMetrics() {
  return (
    <section className="widget account-metrics-widget" aria-label="Account metrics">
      <header className="account-metrics-toolbar">
        <div className="widget-title"><span>Account Metrics</span></div>
      </header>

      <div className="account-metrics-table-wrap">
        <table className="account-metrics-table">
          <colgroup>
            <col className="account-metrics-metric-column" />
            <col className="account-metrics-value-column" />
            <col className="account-metrics-filler-column" />
          </colgroup>
          <thead>
            <tr>
              <th scope="col">Metric</th>
              <th scope="col">Value</th>
              <th aria-hidden="true" />
            </tr>
          </thead>
          <tbody>
            {metrics.map((metric) => (
              <tr key={metric.name}>
                <th scope="row">{metric.name}</th>
                <td>{metric.value}</td>
                <td aria-hidden="true" />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
