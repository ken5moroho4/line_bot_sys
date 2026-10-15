import { newsFlow } from "@/lib/flows/news";
import type { Flow } from "@/lib/flows/types";

// ボットでできること。ここに足せばヘルプと呼び出しに自動で載る
export const FLOWS: Flow[] = [newsFlow];
