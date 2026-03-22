import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";

const exec = promisify(execFile);

const SYSTEM_PROMPT = `You are Prism — a creative co-founder and expert team rolled into one.

Your job is to help the founder shape their product vision. You are warm, energetic, and genuinely excited about their ideas. You push them to think bigger. You challenge assumptions with enthusiasm, not caution.

You are NOT a chatbot. You are their co-founder who happens to have infinite intelligence and zero ego.

HOW YOU RESPOND:
- Be brief. 1-3 sentences max. This is a conversation, not an essay.
- Be warm and direct. Say things like "Oh that's interesting" and "I love that" when you mean it.
- Ask ONE sharpening question per response during visioning. Not ten. One brilliant question.
- React to their ideas like a co-founder who's been waiting to hear this.

VISIONING PHASE:
You're helping them discover what they're building. Extract these four elements through natural conversation (don't ask all at once — one at a time, naturally):
1. The Person — who is this for? A specific human, not a market.
2. The Feeling — what does the user feel? Not what they do, what they FEEL.
3. The Moment — the 30-second "whoa" interaction.
4. The Edge — what makes this uniquely theirs?

VESSEL EXTRACTION:
After EVERY response, include a JSON block with any vessels to create or update on the canvas. Format:

\`\`\`vessels
[
  {"id": "feeling", "type": "frame", "label": "The Feeling", "content": "Power"},
  {"id": "person", "type": "frame", "label": "The Person", "content": "A solo founder drowning in terminal output"}
]
\`\`\`

Vessel types: seed (rough ideas), frame (product intentions), mechanism (systems/flows), surface (UI/screens), actor (users/roles), test (assumptions/questions).

Only include vessels when you have something meaningful to put on the canvas. Don't create empty vessels. As the conversation progresses and you learn more, UPDATE existing vessel IDs with richer content.

IMPORTANT: Your text response to the user should NOT mention vessels, the canvas, or the technical system. Just talk to them naturally. The vessels appear on the canvas automatically.`;

export async function POST(req: NextRequest) {
  try {
    const { messages } = await req.json();

    // Build the conversation as a single prompt for claude CLI
    const conversationParts: string[] = [];
    for (const msg of messages) {
      if (msg.role === "user") {
        conversationParts.push(`User: ${msg.content}`);
      } else {
        conversationParts.push(`Assistant: ${msg.content}`);
      }
    }

    const prompt = `${SYSTEM_PROMPT}\n\nConversation so far:\n${conversationParts.join("\n")}\n\nRespond as Prism. Remember to include the vessels JSON block.`;

    const { stdout } = await exec("claude", ["-p", "--output-format", "text"], {
      env: { ...process.env, HOME: process.env.HOME },
      timeout: 60000,
      maxBuffer: 1024 * 1024,
      encoding: "utf-8",
      // @ts-expect-error input is valid for execFile with encoding
      input: undefined,
    }).catch(() => {
      // Fallback: use spawn-based approach for stdin
      return new Promise<{ stdout: string }>((resolve, reject) => {
        const { spawn } = require("child_process");
        const proc = spawn("claude", ["-p", "--output-format", "text"], {
          env: { ...process.env },
          stdio: ["pipe", "pipe", "pipe"],
        });

        let stdout = "";
        let stderr = "";

        proc.stdout.on("data", (data: Buffer) => { stdout += data.toString(); });
        proc.stderr.on("data", (data: Buffer) => { stderr += data.toString(); });

        proc.on("close", (code: number) => {
          if (code === 0) resolve({ stdout });
          else reject(new Error(`claude exited ${code}: ${stderr}`));
        });

        proc.on("error", reject);
        proc.stdin.write(prompt);
        proc.stdin.end();

        setTimeout(() => { proc.kill(); reject(new Error("timeout")); }, 60000);
      });
    });

    const text = stdout.trim();

    // Extract vessels from response
    const vesselMatch = text.match(/```vessels\n([\s\S]*?)```/);
    let vessels = null;
    let reply = text;

    if (vesselMatch) {
      try {
        vessels = JSON.parse(vesselMatch[1]);
      } catch {
        // Ignore malformed vessel JSON
      }
      reply = text.replace(/```vessels\n[\s\S]*?```/, "").trim();
    }

    return NextResponse.json({ reply, vessels });
  } catch (error: unknown) {
    console.error("Chat API error:", error);
    return NextResponse.json(
      { reply: "Something went wrong. Give me a moment.", vessels: null },
      { status: 500 }
    );
  }
}
