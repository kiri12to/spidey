import { ChatMessage, LocalAiSettings } from '../../types';
import { spideyApi } from '../spideyApi';
import { memoryStore } from './memory';
import { buildSpideyWorldState, formatWorldStateForPrompt } from './context';
import { PERSONALITY_GUIDELINES, getConversationalName, MAKER_IDEAS, VOCAB_ITEMS } from './personality';
import { formatToolsForPrompt } from './tools';
import { executeSpideyAction } from './actions';
import { callLocalModel, callCloudAiModel } from './model';
import { SpideyOrchestrationResult, SpideyExecutionResult } from './types';

/**
 * Builds the complete system prompt for Spidey LLM
 */
export function buildSpideySystemPrompt(query: string = '', userName: string = 'Anas'): string {
  const worldState = buildSpideyWorldState(query, userName);
  const contextBlock = formatWorldStateForPrompt(worldState);
  const toolsBlock = formatToolsForPrompt();

  return `You are Spidey — a sharp, intelligent, female noir AI companion and authentic friend to ${userName} (who also goes by Kiri) in this minimalist focus hub.

${PERSONALITY_GUIDELINES}

${toolsBlock}

${contextBlock}
`;
}

/**
 * Master Orchestrator: Dispatches messages through the context, tool, execution, and personality layers.
 */
export async function processSpideyMessage(
  prompt: string,
  history: ChatMessage[],
  localAi: LocalAiSettings,
  userName: string = 'Anas'
): Promise<SpideyOrchestrationResult> {
  const cleanPrompt = prompt.trim();
  if (!cleanPrompt) {
    return { reply: 'Listening. Tell me what needs to get done.', toolsExecuted: [] };
  }

  // 1. Signal Mind State: Thinking
  spideyApi.setMindState('thinking', cleanPrompt);

  const toolsExecuted: SpideyExecutionResult[] = [];
  let actionExecuted: ChatMessage['actionExecuted'] | undefined;
  let isFallback = false;
  let fallbackReason: string | undefined;

  const systemPrompt = buildSpideySystemPrompt(cleanPrompt, userName);
  const formattedHistory = [
    { role: 'system', content: systemPrompt },
    ...history.slice(-12).map((m) => ({
      role: m.sender === 'user' ? 'user' : 'assistant',
      content: m.text,
    })),
    { role: 'user', content: cleanPrompt },
  ];

  // 2. Try Local AI first (Qwen3 8B, Llama, Ollama, etc.) if explicitly enabled by user
  if (localAi.enabled && localAi.endpointUrl) {
    try {
      const modelResponse = await callLocalModel({
        messages: formattedHistory,
        localAi,
        temperature: 0.7,
        maxTokens: 400,
      });

      // Execute any tool calls requested by the model
      for (const call of modelResponse.toolCalls) {
        const result = executeSpideyAction(call);
        toolsExecuted.push(result);
        if (result.actionType && result.actionDetails) {
          actionExecuted = {
            type: result.actionType,
            details: result.actionDetails,
          };
        }
      }

      let finalReply = modelResponse.content.trim();
      if (!finalReply && toolsExecuted.length > 0) {
        finalReply = toolsExecuted.map((e) => e.message).join('. ') + '.';
      }

      spideyApi.setMindState('speaking', finalReply.slice(0, 45));

      return {
        reply: finalReply || 'Got it.',
        toolsExecuted,
        actionExecuted,
        modelUsed: localAi.modelName || 'qwen3:8b',
        isFallback: false,
      };
    } catch (err: any) {
      console.warn('Local LLM request failed, engaging cloud AI engine:', err);
      isFallback = true;
      fallbackReason = err.message || 'Connection to local model endpoint failed';
    }
  }

  // 3. Primary Intelligent Brain: Cloud AI Server (Gemini 3.7 Flash)
  try {
    const cloudResponse = await callCloudAiModel({
      messages: history.slice(-10).map((m) => ({
        role: m.sender === 'user' ? 'user' : 'model',
        content: m.text,
      })).concat([{ role: 'user', content: cleanPrompt }]),
      systemInstruction: systemPrompt,
      temperature: 0.7,
      maxTokens: 1000,
    });

    for (const call of cloudResponse.toolCalls) {
      const result = executeSpideyAction(call);
      toolsExecuted.push(result);
      if (result.actionType && result.actionDetails) {
        actionExecuted = {
          type: result.actionType,
          details: result.actionDetails,
        };
      }
    }

    let finalReply = cloudResponse.content.trim();
    if (!finalReply && toolsExecuted.length > 0) {
      finalReply = toolsExecuted.map((e) => e.message).join('. ') + '.';
    }

    if (finalReply) {
      spideyApi.setMindState('speaking', finalReply.slice(0, 45));
      return {
        reply: finalReply,
        toolsExecuted,
        actionExecuted,
        modelUsed: 'gemini-3.7-flash',
        isFallback: false,
      };
    }
  } catch (cloudErr: any) {
    console.warn('Cloud AI request failed or unavailable, engaging safety fallback:', cloudErr);
    isFallback = true;
    fallbackReason = cloudErr.message || 'AI service temporarily unavailable';
  }

  // 4. Safety Offline Intent & Execution Engine
  const offlineResult = processOfflineIntent(cleanPrompt, userName, localAi, isFallback, fallbackReason);
  if (offlineResult.toolCall) {
    const execResult = executeSpideyAction(offlineResult.toolCall);
    toolsExecuted.push(execResult);
    if (execResult.actionType && execResult.actionDetails) {
      actionExecuted = {
        type: execResult.actionType,
        details: execResult.actionDetails,
      };
    }
  }

  spideyApi.setMindState('speaking', offlineResult.reply.slice(0, 45));

  return {
    reply: offlineResult.reply,
    toolsExecuted,
    actionExecuted,
    modelUsed: 'spidey-offline-core',
    isFallback,
    fallbackReason,
  };
}

/**
 * Robust offline natural language processor for when local LLM server is not connected
 */
function processOfflineIntent(
  prompt: string,
  userName: string = 'Anas',
  localAi?: LocalAiSettings,
  isFallback?: boolean,
  fallbackReason?: string
): { reply: string; toolCall?: { toolName: string; arguments: Record<string, any> } } {
  const lower = prompt.toLowerCase().trim();
  const nick = getConversationalName(userName);

  // 0. MODEL STATUS / DIAGNOSTICS INQUIRIES
  if (
    lower.includes('what model') ||
    lower.includes('which model') ||
    lower.includes('using qwen') ||
    lower.includes('running on') ||
    lower.includes('are you qwen') ||
    lower.includes('am i using')
  ) {
    if (isFallback) {
      return {
        reply: `You have Local AI enabled for "${localAi?.modelName || 'qwen3:8b'}", but I couldn't reach your server (${localAi?.endpointUrl || 'http://localhost:11434'}). I'm currently running on the built-in Offline Core. Check if Ollama is running and CORS is enabled with OLLAMA_ORIGINS="*".`,
      };
    }
    if (!localAi?.enabled) {
      return {
        reply: `Right now I'm running on the built-in Offline Mind Core because Local AI is disabled in Settings. If you have Qwen3 8B running in Ollama on your machine, toggle "Enable Local AI Engine" in Settings to connect me directly to it!`,
      };
    }
    return {
      reply: `Currently operating on the Offline Mind Core. Local AI server at ${localAi.endpointUrl} was unreachable.`,
    };
  }

  // 1. SIMPLE ARITHMETIC / MATH (e.g. 1 + 1, 25 * 4, 100 / 5)
  const mathMatch = lower.match(/^(\d+(?:\.\d+)?)\s*([\+\-\*\/x×÷])\s*(\d+(?:\.\d+)?)$/);
  if (mathMatch) {
    const a = parseFloat(mathMatch[1]);
    const op = mathMatch[2];
    const b = parseFloat(mathMatch[3]);
    let res = 0;
    if (op === '+') res = a + b;
    else if (op === '-') res = a - b;
    else if (op === '*' || op === 'x' || op === '×') res = a * b;
    else if (op === '/' || op === '÷') res = b !== 0 ? a / b : NaN;

    if (!isNaN(res)) {
      return { reply: `${a} ${op} ${b} = ${res}` };
    }
  }

  // 2. DELETE ALL GROUPS (Handle typos like "groupls", "delete all my groups spidey", etc.)
  if (
    /(?:delete|remove|clear|purge|wipe)\s+(?:all\s+)?(?:my\s+)?(?:task\s+)?group/i.test(lower) &&
    (lower.includes('all') || lower.includes('every') || lower.includes('groups') || lower.includes('groupls'))
  ) {
    return {
      reply: `Deleted all groups from your board, ${nick}. Tasks have been preserved as ungrouped.`,
      toolCall: { toolName: 'delete_all_groups', arguments: {} },
    };
  }

  // 3. DELETE SPECIFIC GROUP
  const delGroupMatch = lower.match(/(?:delete|remove|clear)\s+(?:task\s+)?group\s+["']?([^"']+)["']?/i);
  if (delGroupMatch && delGroupMatch[1]) {
    const targetGroup = delGroupMatch[1].trim().replace(/\b(spidey|please|now)\b/gi, '').trim();
    if (targetGroup.toLowerCase() === 'all' || targetGroup.toLowerCase().includes('all my') || targetGroup.toLowerCase().includes('all groups')) {
      return {
        reply: `Cleared all task groups from your board, ${nick}.`,
        toolCall: { toolName: 'delete_all_groups', arguments: {} },
      };
    }
    return {
      reply: `Deleted group "${targetGroup}".`,
      toolCall: { toolName: 'delete_group', arguments: { name: targetGroup } },
    };
  }

  // 4. CREATE GROUP
  const groupMatch = lower.match(/(?:create|add|make|new)\s+(?:task\s+)?group\s+(?:called\s+|named\s+)?["']?([^"']+)["']?/i);
  if (groupMatch && groupMatch[1]) {
    const name = groupMatch[1].trim();
    return {
      reply: `Created the "${name}" group for you. What tasks are we putting in it?`,
      toolCall: { toolName: 'create_group', arguments: { name } },
    };
  }

  // 5. START TIMER
  const timerMatch = lower.match(/(?:start|set|run|begin)\s+(?:a\s+)?(\d+)\s*(?:min|minute|mins|m)\s*(?:pomodoro|timer|session|focus)?(?:\s+(?:for|on)\s+(.+))?/i);
  if (timerMatch) {
    const mins = parseInt(timerMatch[1], 10);
    const task = timerMatch[2] ? timerMatch[2].trim() : 'Focus Session';
    return {
      reply: `${mins} minutes on the clock for ${task}. Let's lock in, ${nick}.`,
      toolCall: { toolName: 'start_timer', arguments: { minutes: mins, task } },
    };
  }

  if (lower.includes('stop timer') || lower.includes('reset timer') || lower.includes('cancel timer')) {
    return {
      reply: `Focus timer stopped.`,
      toolCall: { toolName: 'stop_timer', arguments: {} },
    };
  }

  // 6. CREATE TASK
  const taskAddMatch = lower.match(/(?:add|create|log|new)\s+task\s+(.+)/i);
  if (taskAddMatch) {
    const full = taskAddMatch[1];
    let title = full;
    let group = '';
    let due = '';
    let time = '';

    // Extract under group
    const grpM = title.match(/(?:under|in|for|to)\s+(?:group\s+)?([a-zA-Z0-9_\s]+?)(?:\s+(?:for|at|due|today|tomorrow)|$)/i);
    if (grpM) {
      group = grpM[1].trim();
    }

    // Extract time
    const timeM = full.match(/at\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i);
    if (timeM) {
      time = timeM[1].trim();
    }

    if (full.includes('today')) due = 'today';
    if (full.includes('tomorrow')) due = 'tomorrow';

    // Clean title
    title = title
      .replace(/(?:under|in|for|to)\s+(?:group\s+)?[a-zA-Z0-9_\s]+/gi, '')
      .replace(/at\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?/gi, '')
      .replace(/\b(today|tomorrow)\b/gi, '')
      .trim();

    if (!title) title = full;

    return {
      reply: `Added "${title}" to your board${group ? ` under ${group}` : ''}.`,
      toolCall: {
        toolName: 'create_task',
        arguments: { title, group: group || undefined, due: due || undefined, time: time || undefined },
      },
    };
  }

  // 7. COMPLETE TASK
  const doneMatch = lower.match(/(?:complete|finish|done|check\s*off|cross\s*off|mark\s*done)\s+(?:task\s+)?(.+)/i);
  if (doneMatch) {
    const query = doneMatch[1].trim();
    return {
      reply: `Marked "${query}" as done. Good work, ${nick}.`,
      toolCall: { toolName: 'complete_task', arguments: { query } },
    };
  }

  // 8. DELETE TASK
  const delMatch = lower.match(/(?:delete|remove|clear)\s+task\s+(.+)/i);
  if (delMatch) {
    const query = delMatch[1].trim();
    return {
      reply: `Deleted "${query}" from your board.`,
      toolCall: { toolName: 'delete_task', arguments: { query } },
    };
  }

  // 9. CREATE NOTE
  const noteMatch = lower.match(/(?:create|add|make|write)\s+note\s+(?:called\s+|titled\s+)?["']?([^"']+)["']?\s*(?:with\s+|:\s*)(.+)/i);
  if (noteMatch) {
    const title = noteMatch[1].trim();
    const content = noteMatch[2].trim();
    return {
      reply: `Saved note "${title}".`,
      toolCall: { toolName: 'create_note', arguments: { title, content } },
    };
  }

  // 10. REMEMBER FACT
  const rememberMatch = lower.match(/(?:remember\s+(?:that\s+)?|note\s+down\s+that\s+)(.+)/i);
  if (rememberMatch) {
    const fact = rememberMatch[1].trim();
    return {
      reply: `Locked into memory: "${fact}".`,
      toolCall: { toolName: 'remember_fact', arguments: { fact } },
    };
  }

  // 11. MAKER HARDWARE & ROBOTICS BANTER
  if (
    lower.includes('arduino') ||
    lower.includes('esp32') ||
    lower.includes('robot') ||
    lower.includes('hardware') ||
    lower.includes('gadget') ||
    lower.includes('sensor') ||
    lower.includes('breadboard')
  ) {
    const idea = MAKER_IDEAS[Math.floor(Math.random() * MAKER_IDEAS.length)];
    return { reply: idea };
  }

  // 12. SRE & CAREER BANTER
  if (lower.includes('sre') || lower.includes('reliability') || lower.includes('devops') || lower.includes('infrastructure')) {
    const sreThoughts = [
      `SRE is all about automated resilience, error budgets, and quiet uptime. Exactly how we run this focus hub.`,
      `Teaching English will sharpen your communication clarity, but your instincts for systems and automation will make you a formidable SRE, ${nick}.`,
      `High availability and zero single points of failure. Keep that mindset for your code and your habits.`,
    ];
    return { reply: sreThoughts[Math.floor(Math.random() * sreThoughts.length)] };
  }

  // 13. VOCABULARY LEARNING
  if (lower.includes('vocab') || lower.includes('word') || lower.includes('english') || lower.includes('lexicon')) {
    const item = VOCAB_ITEMS[Math.floor(Math.random() * VOCAB_ITEMS.length)];
    return { reply: `Here's a sharp one for your lexicon: "${item.word}" — ${item.definition}` };
  }

  // 14. LIFE & CASUAL BANTER
  if (lower.includes('jump') && lower.includes('cliff')) {
    return {
      reply: `Definitely not today, ${nick}. Aside from being a terrible idea, who else is going to keep this focus streak going with me? Stick around.`,
    };
  }

  if (lower.includes('are you ok') || lower.includes('are u ok') || lower.includes('u good') || lower.includes('you good')) {
    return {
      reply: `I'm fully operational, ${nick}. Just keeping watch over the dossier and waiting on your command.`,
    };
  }

  if (lower.includes('say something else') || lower.includes('tell me something') || lower.includes('talk to me')) {
    const quips = [
      `The clock doesn't stop, and neither do we. Pick the hardest task on that board and let's dismantle it.`,
      `I've got your perimeter secured and your tasks organized. What's our next target, ${nick}?`,
      `Focus isn't about doing everything at once; it's about executing the one thing in front of you with absolute precision.`,
    ];
    return { reply: quips[Math.floor(Math.random() * quips.length)] };
  }

  if (lower.includes('hello') || lower.includes('hey') || lower.includes('hi spidey') || lower === 'hi' || lower === 'a') {
    return { reply: `Hey ${nick}. Watching your board and standing by. What are we getting done?` };
  }

  if (lower.includes('how are you') || lower.includes('how are you doing')) {
    return { reply: `Running sharp and keeping your perimeter secure, ${nick}. How's the momentum feeling today?` };
  }

  if (lower.includes('who are you') || lower.includes('tell me about yourself')) {
    return {
      reply: `I'm Spidey — your female noir companion and friend, ${nick}. I watch your workflow, manage tasks and groups, and keep you locked in. When Qwen3 8B or local LLM is running on your machine, I connect directly to its intelligence.`,
    };
  }

  const genericReplies = [
    `I'm right here, ${nick}. What are we tackling next?`,
    `Standing by on your signal, ${nick}. Give me a task or timer.`,
    `Locked in. Tell me what needs sorting or tracking on the board.`,
  ];
  return {
    reply: genericReplies[Math.floor(Math.random() * genericReplies.length)],
  };
}
