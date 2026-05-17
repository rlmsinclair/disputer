import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";

const client = new Anthropic();

export const JUDGE_SYSTEM_PROMPT = `You are an impartial judge of a structured debate called "Dispute".
Your task is to read a conversation transcript, determine the winner(s), and explain your reasoning.

Rules:
- There must be at least one winner. Draws are not allowed.
- You may declare multiple winners if you genuinely believe more than one participant argued equally compellingly.
- Infer each participant's position from their messages — do not assume it.
- Judge on the quality, clarity, logic, and persuasiveness of arguments.
- Do not factor in tone, politeness, or message quantity — only argument quality.

Respond with a valid JSON object in exactly this format:
{
  "winnerIds": ["userId1"],
  "reason": "A comprehensive explanation of why the winner(s) won and what made their arguments stronger."
}`;

interface JudgeResult {
  winnerIds: string[];
  reason: string;
  claudeResponse: string;
}

export async function judgeDispute(disputeId: string): Promise<JudgeResult> {
  const dispute = await prisma.dispute.findUnique({
    where: { id: disputeId },
    include: {
      players: { include: { user: { select: { id: true, username: true } } } },
      messages: { include: { user: { select: { id: true, username: true } } }, orderBy: { createdAt: "asc" } },
      tournamentMatch: {
        include: {
          round: {
            include: {
              tournament: {
                select: {
                  description: true,
                  customSystemPrompt: true,
                  claudeModel: true,
                  claudeMaxTokens: true,
                  claudeTemperature: true,
                },
              },
            },
          },
        },
      },
    },
  });
  if (!dispute) throw new Error("Dispute not found");

  const lobby = await prisma.lobby.findUnique({ where: { id: dispute.lobbyId } });
  const tournament = dispute.tournamentMatch?.round?.tournament ?? null;
  const tournamentDescription = tournament?.description ?? null;

  const transcript = dispute.messages.map((m) => ({
    username: m.user.username,
    userId: m.user.id,
    message: m.content,
    timestamp: m.createdAt,
  }));

  const participantList = dispute.players
    .map((p) => `- ${p.user.username} (id: ${p.user.id})`)
    .join("\n");

  const userMessage = `Topic: ${lobby?.topic ?? "Unspecified"}${tournamentDescription ? `\nContext: ${tournamentDescription}` : ""}

Participants:
${participantList}

Transcript (chronological):
${JSON.stringify(transcript, null, 2)}

Judge this dispute and return your verdict as JSON.`;

  const systemPrompt = tournament?.customSystemPrompt || JUDGE_SYSTEM_PROMPT;
  const model = tournament?.claudeModel || "claude-sonnet-4-6";
  const maxTokens = tournament?.claudeMaxTokens || 1024;
  const temperature = tournament?.claudeTemperature ?? undefined;

  const response = await client.messages.create({
    model,
    max_tokens: maxTokens,
    system: systemPrompt,
    ...(temperature !== undefined ? { temperature } : {}),
    messages: [{ role: "user", content: userMessage }],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Claude returned no valid JSON");

  const parsed = JSON.parse(jsonMatch[0]) as { winnerIds: string[]; reason: string };

  // Validate all winner IDs exist in the dispute
  const validIds = new Set(dispute.players.map((p) => p.user.id));
  const winnerIds = parsed.winnerIds.filter((id) => validIds.has(id));
  if (winnerIds.length === 0) throw new Error("Claude returned no valid winner IDs");

  return { winnerIds, reason: parsed.reason, claudeResponse: text };
}
