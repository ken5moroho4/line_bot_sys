import { newsFlow } from "@/lib/flows/news";
import { newsDeleteFlow } from "@/lib/flows/news-delete";
import type { Flow } from "@/lib/flows/types";

// ボットでできること。ここに足せばヘルプと呼び出しに自動で載る
export const FLOWS: Flow[] = [newsFlow, newsDeleteFlow];
export const DEFAULT_FLOW: Flow = newsFlow;
