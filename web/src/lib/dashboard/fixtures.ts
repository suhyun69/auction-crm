import type { DashboardData } from "./types";

export const demoDashboard: DashboardData = {
  summary: { bidCount: 24, participantCount: 6, highestAmount: 1850000, highestBidderName: "김민서" },
  participants: [
    { participantId: 1, customerName: "김민서", rank: 1, highestAcceptedAmount: 1850000, bidCount: 7, lastBidAt: "2026-11-18T05:32:18Z" },
    { participantId: 2, customerName: "이준호", rank: 2, highestAcceptedAmount: 1700000, bidCount: 5, lastBidAt: "2026-11-18T05:31:42Z" },
    { participantId: 3, customerName: "박서연", rank: 3, highestAcceptedAmount: 1450000, bidCount: 4, lastBidAt: "2026-11-18T05:30:07Z" },
    { participantId: 4, customerName: "최도윤", rank: 4, highestAcceptedAmount: 1200000, bidCount: 4, lastBidAt: "2026-11-18T05:28:51Z" },
    { participantId: 5, customerName: "정수빈", rank: 5, highestAcceptedAmount: 900000, bidCount: 3, lastBidAt: "2026-11-18T05:27:33Z" },
    { participantId: 6, customerName: "윤지우", rank: 6, highestAcceptedAmount: null, bidCount: 1, lastBidAt: "2026-11-18T05:29:04Z" },
  ],
};

export const emptyDashboard: DashboardData = {
  summary: { bidCount: 0, participantCount: 0, highestAmount: 0, highestBidderName: null },
  participants: [],
};

export const edgeDashboard: DashboardData = {
  summary: { bidCount: 24, participantCount: 6, highestAmount: Number.MAX_SAFE_INTEGER, highestBidderName: "긴이름확인".repeat(20) },
  participants: demoDashboard.participants.map((participant, index) => index === 0 ? {
    ...participant,
    customerName: "긴이름확인".repeat(20),
    highestAcceptedAmount: Number.MAX_SAFE_INTEGER,
  } : participant),
};
