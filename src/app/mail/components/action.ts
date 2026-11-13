'use server';

import { streamText } from 'ai';
import { createStreamableValue } from 'ai/rsc';
import { chatModel, AI_RETRIES } from '@/server/ai/provider';
import { getKindeUserForAPI } from '@/lib/kinde';

/** Server actions are public endpoints: only signed-in users may use the AI. */
async function requireUser() {
    const user = await getKindeUserForAPI();
    if (!user?.id) throw new Error("Please sign in to use AI features.");
}

export async function generate(input: string) {
    await requireUser();
    const stream = createStreamableValue('');

    // console.log("input", input);
    (async () => {
        const { textStream } = await streamText({
            model: chatModel('smart'),
            maxRetries: AI_RETRIES,
            prompt: `
            You are a helpful AI embedded in a email client app that is used to answer questions about the emails in the inbox.
            ${input}
            `,
        });

        for await (const delta of textStream) {
            stream.update(delta);
        }

        stream.done();
    })();

    return { output: stream.value };
}