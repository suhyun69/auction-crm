export type Participant = {
  participantId: number;
  customerName: string;
  rank: number;
  highestAcceptedAmount: number | null;
  bidCount: number;
  lastBidAt: string;
};

export type DashboardData = {
  summary: {
    bidCount: number;
    participantCount: number;
    highestAmount: number;
    highestBidderName: string | null;
  };
  participants: Participant[];
};

export type ConnectionStatus = "demo" | "connecting" | "connected" | "reconnecting" | "disconnected";
