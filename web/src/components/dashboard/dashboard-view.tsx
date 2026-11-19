import { formatAmount, formatNumber, formatTime } from "@/lib/dashboard/format";
import type { ConnectionStatus, DashboardData } from "@/lib/dashboard/types";

const connectionLabels: Record<ConnectionStatus, string> = {
  connecting: "연결 중", connected: "실시간 연결됨",
  reconnecting: "다시 연결 중", disconnected: "연결 끊김",
};

type Props = {
  data: DashboardData | null;
  loading?: boolean;
  error?: string | null;
  connectionStatus: ConnectionStatus;
  changedParticipantIds?: number[];
  onRetry?: () => void;
  /** 현재 시뮬레이션에 참여 중인 이름. 이 행만 상세를 열 수 있다. */
  simulationNames?: Set<string>;
  onSelectParticipant?: (customerName: string) => void;
};

export function DashboardView({ data, loading = false, error, connectionStatus, changedParticipantIds = [], onRetry, simulationNames, onSelectParticipant }: Props) {
  return (
    <>
      <header className="page-header">
        <div>
          <div className="eyebrow">AUCTION OVERVIEW</div>
          <h1>경매 대시보드</h1>
          <p className="page-description">응찰 현황과 참가자 순위를 한눈에 확인하세요.</p>
        </div>
        <span className={`connection-status status-${connectionStatus}`} role="status">
          <span className="status-dot" />{connectionLabels[connectionStatus]}
        </span>
      </header>

      {(connectionStatus === "reconnecting" || connectionStatus === "disconnected") && <div className="connection-banner" role="status"><span>실시간 연결이 끊겼습니다. {data ? "마지막으로 확인한 현황을 표시합니다." : connectionStatus === "reconnecting" ? "자동으로 다시 연결하고 있습니다." : "연결을 다시 시도해 주세요."}</span>{onRetry && <button className="secondary-button" onClick={onRetry}>연결 다시 시도</button>}</div>}

      {error && <div className="error-banner" role="alert">
        <div><strong>현황을 불러오지 못했습니다.</strong><p>{error}</p></div>
        {onRetry && <button className="secondary-button" onClick={onRetry}>다시 시도</button>}
      </div>}

      <section className="summary-grid" aria-label="경매 요약" aria-busy={loading}>
        <SummaryCard label="총 응찰 수" value={data ? formatNumber(data.summary.bidCount) : "—"} unit="회" detail="승인·기각을 포함한 응찰" loading={loading && !data} />
        <SummaryCard label="현재 최고가" value={data ? formatAmount(data.summary.highestAmount) : "—"} detail={data?.summary.highestBidderName ?? "첫 응찰을 기다리고 있습니다"} featured loading={loading && !data} />
        <SummaryCard label="참가자 수" value={data ? formatNumber(data.summary.participantCount) : "—"} unit="명" detail="경매에 응찰한 참가자" loading={loading && !data} />
      </section>

      <section className="participants-panel" aria-labelledby="participants-title" aria-busy={loading}>
        <div className="panel-header">
          <div className="panel-title"><h2 id="participants-title">참가자 순위</h2><span className="count-badge">{data ? formatNumber(data.summary.participantCount) : "—"}명</span></div>
          <span className="sort-note">최고 승인 금액순 <span aria-hidden="true">↓</span></span>
        </div>
        {loading && !data ? <div className="loading-state" role="status"><span className="spinner" />응찰 현황을 불러오는 중입니다</div>
          : !data ? <div className="empty-state"><div className="empty-symbol" aria-hidden="true">!</div><h3>현황을 확인할 수 없습니다</h3><p>연결 상태를 확인한 뒤 다시 시도해 주세요.</p></div>
          : data.participants.length === 0 ? <div className="empty-state"><div className="empty-symbol" aria-hidden="true">↗</div><h3>첫 응찰을 기다리고 있습니다</h3><p>응찰이 접수되면 참가자와 순위가 여기에 표시됩니다.</p></div>
          : <><div className="list-heading" aria-hidden="true"><span>순위</span><span>참가자</span><span className="align-right">최고 승인 금액</span><span className="align-right">응찰 횟수</span><span className="align-right">마지막 응찰 · 한국 시간</span></div>
          <ol className="participant-list" aria-label="참가자 목록">
            {data.participants.map((participant) => {
              const leading = participant.rank === 1 && participant.highestAcceptedAmount !== null;
              const changed = changedParticipantIds.includes(participant.participantId);
              const simulated = !!onSelectParticipant && !!simulationNames?.has(participant.customerName.trim());
              const nameContent = <><span className="avatar" aria-hidden="true">{participant.customerName.slice(0, 1)}</span><div className="name-content"><span className="name-text">{participant.customerName}</span>{leading && <span className="leader-badge">최고가</span>}{participant.highestAcceptedAmount === null && <span className="no-accepted">승인 이력 없음</span>}{simulated && <span className="simulated-badge">시뮬레이션</span>}</div></>;
              return <li key={participant.participantId} className={`participant-row ${leading ? "is-leading" : ""} ${changed ? "is-changed" : ""}`} data-participant-id={participant.participantId}>
                <span className="rank" aria-label={`${participant.rank}위`}>{String(participant.rank).padStart(2, "0")}</span>
                {simulated
                  ? <button type="button" className="participant-name participant-open" onClick={() => onSelectParticipant(participant.customerName)} aria-label={`${participant.customerName} 시뮬레이션 설정과 응찰 시도 내역 보기`}>{nameContent}</button>
                  : <div className="participant-name">{nameContent}</div>}
                <div className="participant-amount"><span className="mobile-label">최고 승인 금액</span><strong>{formatAmount(participant.highestAcceptedAmount)}</strong></div>
                <div className="participant-count"><span className="mobile-label">응찰</span><span>{formatNumber(participant.bidCount)}회</span></div>
                <time className="participant-time" dateTime={participant.lastBidAt}><span className="mobile-label">마지막 응찰</span>{formatTime(participant.lastBidAt)}</time>
              </li>;
            })}
          </ol></>}
        <div className="panel-footer"><span className="info-symbol" aria-hidden="true">i</span>현재 최고가를 초과한 응찰만 승인됩니다. 동일하거나 낮은 금액은 기각됩니다.</div>
      </section>
    </>
  );
}

function SummaryCard({ label, value, unit, detail, featured = false, loading = false }: {
  label: string; value: string; unit?: string; detail: string; featured?: boolean; loading?: boolean;
}) {
  return <article className={`summary-card ${featured ? "summary-featured" : ""}`}>
    <p className="summary-label">{label}{featured && <span aria-hidden="true">↗</span>}</p>
    <div className={`summary-value ${loading ? "skeleton" : ""} ${value.length > 18 ? "is-long-value" : ""}`}><strong>{value}</strong>{unit && <span className="summary-unit">{unit}</span>}</div>
    <p className="summary-detail">{detail}</p>
  </article>;
}
