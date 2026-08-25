import { commsCampaignPacket } from "./comms-campaign";
import { experimentReportPacket } from "./experiment-report";
import { fieldNotesPacket } from "./field-notes";
import { grantShopPacket } from "./grant-shop";
import { historySeminarPacket } from "./history-seminar";
import { legalMatterPacket } from "./legal-matter";
import { parseSeedPacket, type SeedPacket } from "./types";
import { welcomePacket } from "./welcome";

const RAW_PACKETS = [
  welcomePacket,
  historySeminarPacket,
  grantShopPacket,
  fieldNotesPacket,
  experimentReportPacket,
  legalMatterPacket,
  commsCampaignPacket,
];

export const PACKETS: SeedPacket[] = RAW_PACKETS.map(parseSeedPacket);

const BY_ID = new Map(PACKETS.map((packet) => [packet.id, packet]));

if (BY_ID.size !== PACKETS.length) {
  throw new Error("Seed packet ids must be unique.");
}

export function listPackets(): SeedPacket[] {
  return PACKETS;
}

export function getPacket(id: string): SeedPacket | undefined {
  return BY_ID.get(id);
}
