import { formatHour } from "../format";
import { formatMinutes } from "../utils";

interface ActivityChartProps {
  hourlyDistribution: number[];
  peakHour: number;
  hourlyUnit?: "ms" | "plays";
}

export function ActivityChart({
  hourlyDistribution,
  peakHour,
  hourlyUnit = "ms",
}: ActivityChartProps) {
  const { TooltipWrapper } = Spicetify.ReactComponent;
  if (!hourlyDistribution.some((h) => h > 0)) {
    return null;
  }

  const max = Math.max(...hourlyDistribution, 1);

  const formatValue = (val: number) => {
    if (hourlyUnit === "plays") {
      return `${val} ${val === 1 ? "play" : "plays"}`;
    }
    return formatMinutes(val);
  };

  return (
    <div className="activity-section">
      <div className="activity-header">
        <h3 className="activity-title">Activity by Hour</h3>
        <div className="activity-peak">
          Peak: <strong>{formatHour(peakHour)}</strong>
        </div>
      </div>
      <div className="activity-chart">
        {hourlyDistribution.map((val, hr) => {
          const h = val > 0 ? Math.max((val / max) * 100, 5) : 0;
          return (
            <TooltipWrapper
              key={hr}
              label={`${formatHour(hr)}: ${formatValue(val)}`}
              placement="top"
            >
              <div
                className={`activity-bar ${hr === peakHour && val > 0 ? "peak" : ""}`}
                style={{ height: `${h}%`, animationDelay: `${hr * 0.02}s` }}
              />
            </TooltipWrapper>
          );
        })}
      </div>
      <div className="chart-labels">
        <span>{formatHour(0)}</span>
        <span>{formatHour(6)}</span>
        <span>{formatHour(12)}</span>
        <span>{formatHour(18)}</span>
        <span>{formatHour(0)}</span>
      </div>
    </div>
  );
}
