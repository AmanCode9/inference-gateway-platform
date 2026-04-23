export type ChatMessageRole = "system" | "user" | "assistant";

export interface ChatMessage {
  readonly role: ChatMessageRole;
  readonly content: string;
}

export interface ChatCompletionRequest {
  readonly model: string;
  readonly messages: readonly ChatMessage[];
}

export interface ChatCompletionChoice {
  readonly index: number;
  readonly message: {
    readonly role: "assistant";
    readonly content: string;
  };
  readonly finishReason: "stop";
}

export interface ProviderChatCompletion {
  readonly id: string;
  readonly object: "chat.completion";
  readonly created: number;
  readonly model: string;
  readonly provider: string;
  readonly choices: readonly ChatCompletionChoice[];
}

export interface ChatCompletionResponse extends ProviderChatCompletion {
  readonly requestId: string;
}
