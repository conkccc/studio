'use server';
/**
 * @fileOverview Cost analysis AI agent.
 *
 * - costAnalysis - A function that handles the cost analysis process.
 * - CostAnalysisInput - The input type for the costAnalysis function.
 * - CostAnalysisOutput - The return type for the costAnalysis function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const CostAnalysisInputSchema = z.object({
  spendingData: z
    .string()
    .describe(
      'A string containing the spending data of the group, including item descriptions and amounts.'
    ),
});
export type CostAnalysisInput = z.infer<typeof CostAnalysisInputSchema>;

const CostAnalysisOutputSchema = z.object({
  summary: z.string().describe('A summary of the spending data.'),
  costCuttingSuggestions: z
    .string()
    .describe('Suggestions for cutting costs based on the spending data.'),
});
export type CostAnalysisOutput = z.infer<typeof CostAnalysisOutputSchema>;

export async function costAnalysis(input: CostAnalysisInput): Promise<CostAnalysisOutput> {
  return costAnalysisFlow(input);
}

const prompt = ai.definePrompt({
  name: 'costAnalysisPrompt',
  input: {schema: CostAnalysisInputSchema},
  output: {schema: CostAnalysisOutputSchema},
  prompt: `You are an expert financial analyst specializing in cost reduction.

You will analyze the provided spending data and provide a summary of the spending and suggestions for cutting costs.

Spending Data: {{{spendingData}}}`,
});

const costAnalysisFlow = ai.defineFlow(
  {
    name: 'costAnalysisFlow',
    inputSchema: CostAnalysisInputSchema,
    outputSchema: CostAnalysisOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
