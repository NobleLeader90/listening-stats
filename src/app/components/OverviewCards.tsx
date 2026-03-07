import { formatDurationLong } from "../../services/stats";
import { ListeningStats } from "../../types";
import { formatNumber } from "../format";
import { estimateArtistPayout } from "../utils";
import { AnimatedNumber } from "./AnimatedNumber";
import { PeriodTabs } from "./PeriodTabs";

function getDaysInPeriod(period: string): number {
  const now = new Date();
  switch (period) {
    case "today":
      return 1;
    case "this_week":
      return now.getDay() + 1;
    case "this_month":
      return now.getDate();
    case "7day":
      return 7;
    case "1month":
      return 30;
    case "3month":
      return 91;
    case "6month":
      return 182;
    case "12month":
      return 365;
    case "weeks":
      return 28;
    case "months":
      return 182;
    case "recent":
      return 3;
    default:
      return 365;
  }
}

interface OverviewCardsProps {
  stats: ListeningStats;
  period: string;
  periods: string[];
  periodLabels: Record<string, string>;
  onPeriodChange: (period: string) => void;
}

export function OverviewCards({
  stats,
  period,
  periods,
  periodLabels,
  onPeriodChange,
}: OverviewCardsProps) {
  const { TooltipWrapper } = Spicetify.ReactComponent;
  const payout = estimateArtistPayout(stats.trackCount);
  const daysInPeriod = getDaysInPeriod(period);
  const avgPlaysPerDay =
    stats.trackCount > 0 ? Math.round(stats.trackCount / daysInPeriod) : 0;

  return (
    <div className="overview-row">
      <div className="overview-card hero">
        <div className="overview-value">
          <AnimatedNumber
            value={stats.totalTimeMs}
            format={formatDurationLong}
          />
        </div>
        <div className="overview-label">Time Listened</div>
        <PeriodTabs
          period={period}
          periods={periods}
          periodLabels={periodLabels}
          onPeriodChange={onPeriodChange}
        />
        <div className="overview-secondary">
          <TooltipWrapper
            label="Total number of tracks played (including repeats)"
            placement="top"
          >
            <div className="overview-stat">
              <div className="overview-stat-value">
                <AnimatedNumber
                  value={stats.trackCount}
                  format={formatNumber}
                />
              </div>
              <div className="overview-stat-label">Tracks</div>
            </div>
          </TooltipWrapper>
          <TooltipWrapper
            label="Number of different artists you've listened to"
            placement="top"
          >
            <div className="overview-stat">
              <div className="overview-stat-value">
                <AnimatedNumber
                  value={stats.uniqueArtistCount}
                  format={formatNumber}
                />
              </div>
              <div className="overview-stat-label">Artists</div>
            </div>
          </TooltipWrapper>
          <TooltipWrapper
            label="Number of different tracks you've listened to"
            placement="top"
          >
            <div className="overview-stat">
              <div className="overview-stat-value">
                <AnimatedNumber
                  value={stats.uniqueTrackCount}
                  format={formatNumber}
                />
              </div>
              <div className="overview-stat-label">Unique</div>
            </div>
          </TooltipWrapper>
          {stats.lastfmConnected && stats.totalScrobbles ? (
            <TooltipWrapper
              label="Total plays recorded by Last.fm"
              placement="top"
            >
              <div className="overview-stat">
                <div className="overview-stat-value">
                  {formatNumber(stats.totalScrobbles)}
                </div>
                <div className="overview-stat-label">Scrobbles</div>
              </div>
            </TooltipWrapper>
          ) : null}
        </div>
      </div>

      <div className="overview-card-list">
        <div className="overview-card">
          <div className="stat-colored">
            <TooltipWrapper
              label="Estimated amount Spotify paid artists from your streams ($0.004/stream)"
              placement="top"
            >
              <div className="stat-text">
                <div className="overview-value green">${payout}</div>
                <div className="overview-label">Spotify paid artists</div>
              </div>
            </TooltipWrapper>
          </div>
        </div>

        <div className="overview-card">
          <div className="stat-colored">
            <TooltipWrapper
              label="Consecutive days with at least one play"
              placement="top"
            >
              <div className="stat-text">
                <div className="overview-value orange">
                  {stats.streakDays === null ? (
                    <span className="skeleton-stat-value" />
                  ) : (
                    formatNumber(stats.streakDays)
                  )}
                </div>
                <div className="overview-label">Day Streak</div>
              </div>
            </TooltipWrapper>
          </div>
        </div>

        {stats.newArtistsCount > 0 ? (
          <div className="overview-card">
            <div className="stat-colored">
              <TooltipWrapper
                label="Artists you listened to for the first time in this period"
                placement="top"
              >
                <div className="stat-text">
                  <div className="overview-value purple">
                    {formatNumber(stats.newArtistsCount)}
                  </div>
                  <div className="overview-label">New Artists</div>
                </div>
              </TooltipWrapper>
            </div>
          </div>
        ) : (
          <div className="overview-card">
            <div className="stat-colored">
              <TooltipWrapper
                label="Average number of tracks played per day in this period"
                placement="top"
              >
                <div className="stat-text">
                  <div className="overview-value purple">
                    {formatNumber(avgPlaysPerDay)}
                  </div>
                  <div className="overview-label">Plays/Day</div>
                </div>
              </TooltipWrapper>
            </div>
          </div>
        )}

        <div className="overview-card">
          <div className="stat-colored">
            <TooltipWrapper
              label="Percentage of tracks skipped before the play threshold"
              placement="top"
            >
              <div className="stat-text">
                <div className="overview-value red">
                  {Math.floor(stats.skipRate * 100)}%
                </div>
                <div className="overview-label">Skip Rate</div>
              </div>
            </TooltipWrapper>
          </div>
        </div>
      </div>
    </div>
  );
}
