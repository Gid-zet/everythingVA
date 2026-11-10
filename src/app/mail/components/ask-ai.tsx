'use client'
import { useChat } from 'ai/react'
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button'
import { AnimatePresence } from 'framer-motion';
import React from 'react'
import { Send } from 'lucide-react';
import { useLocalStorage } from 'usehooks-ts';
import { cn } from '@/lib/utils';
import { SparklesIcon } from '@heroicons/react/24/solid';
import StripeButton from './stripe-button';
import PremiumBanner from './premium-banner';
import { toast } from 'sonner';


const transitionDebug = {
    type: "easeOut",
    duration: 0.2,
};
const AskAI = ({ isCollapsed }: { isCollapsed: boolean }) => {
    const [accountId] = useLocalStorage('accountId', '')
    const { input, handleInputChange, handleSubmit, messages, isLoading, error } = useChat({
        api: "/api/chat",
        body: {
            accountId,
        },
        onError: (error) => {
            console.error("Chat error:", error);
            
            if (error.message.includes('Limit reached')) {
                toast.error('You have reached the limit for today. Please upgrade to pro to ask as many questions as you want');
            } else if (error.message.includes('Account not found') || error.message.includes('account')) {
                toast.error('Please select a valid email account first');
            } else if (error.message.includes('required') || error.message.includes('Invalid')) {
                toast.error('Invalid request. Please try again.');
            } else if (error.message.includes('unavailable') || error.message.includes('service')) {
                toast.error('AI service is temporarily unavailable. Please try again later.');
            } else if (error.message.includes('Unauthorized')) {
                toast.error('You are not authorized. Please log in again.');
            } else {
                toast.error(`Unable to process your question: ${error.message || 'Unknown error'}`);
            }
        },
        initialMessages: [],
    });
    React.useEffect(() => {
        const messageContainer = document.getElementById("message-container");
        if (messageContainer) {
            messageContainer.scrollTo({
                top: messageContainer.scrollHeight,
                behavior: "smooth",
            });
        }
    }, [messages]);

    const handleFormSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!accountId) {
            toast.error('Please select an email account first');
            return;
        }
        if (!input.trim()) {
            return;
        }
        handleSubmit(e);
    };

    if (isCollapsed) return null;
    return (
        <div className='px-3 pb-3'>

            <PremiumBanner />
            <div className="h-3"></div>
            <motion.div className="flex flex-1 flex-col items-end justify-end rounded-xl border bg-background p-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
                <div className="max-h-[40vh] overflow-y-auto w-full flex flex-col gap-1.5" id='message-container'>
                    <AnimatePresence mode="wait">
                        {messages.map((message) => (
                            <motion.div
                                key={message.id}
                                layout="position"
                                className={cn("z-10 mt-1 max-w-[260px] break-words rounded-2xl", {
                                    'self-end rounded-br-md bg-muted text-foreground': message.role === 'user',
                                    'self-start rounded-bl-md bg-brand text-brand-foreground': message.role === 'assistant',
                                })}
                                layoutId={`container-[${messages.length - 1}]`}
                                transition={transitionDebug}
                            >
                                <div className="px-3 py-2 text-[13px] leading-snug">
                                    {message.content}
                                </div>
                            </motion.div>
                        ))}
                        {isLoading && (
                            <motion.div
                                layout="position"
                                className="self-start rounded-2xl rounded-bl-md bg-brand/10 text-brand z-10 mt-1 max-w-[260px] break-words"
                                transition={transitionDebug}
                            >
                                <div className="px-3 py-2 text-[13px] leading-snug">
                                    Thinking...
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
                {messages.length > 0 && <div className="h-4"></div>}
                <div className="w-full">
                    {messages.length === 0 && !error && (
                        <div className="mb-4">
                            {!accountId ? (
                                <div className='flex items-center gap-4 p-3 bg-amber-50 dark:bg-amber-500/10 rounded-lg'>
                                    <SparklesIcon className='size-6 text-yellow-600 dark:text-yellow-400' />
                                    <div>
                                        <p className='text-sm font-medium'>Select an email account</p>
                                        <p className='text-muted-foreground text-xs'>Please select an email account to ask questions about your emails</p>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <div className='flex items-center gap-4'>
                                        <span className='flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand'><SparklesIcon className='size-4' /></span>
                                        <div>
                                            <p className='text-sm font-medium'>Ask your inbox</p>
                                            <p className='text-muted-foreground text-xs'>Answers grounded in your email</p>
                                        </div>
                                    </div>
                                    <div className="h-2"></div>
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span onClick={() => handleInputChange({
                                            target: {
                                                value: 'What can I ask?'
                                            }
                                        })} className='px-2 py-1 border bg-muted/50 text-muted-foreground rounded-full text-[11px] cursor-pointer transition-colors hover:bg-muted hover:text-foreground'>What can I ask?</span>
                                        <span onClick={() => handleInputChange({
                                            target: {
                                                value: 'When is my next flight?'
                                            }
                                        })} className='px-2 py-1 border bg-muted/50 text-muted-foreground rounded-full text-[11px] cursor-pointer transition-colors hover:bg-muted hover:text-foreground'>When is my next flight?</span>
                                        <span onClick={() => handleInputChange({
                                            target: {
                                                value: 'When is my next meeting?'
                                            }
                                        })} className='px-2 py-1 border bg-muted/50 text-muted-foreground rounded-full text-[11px] cursor-pointer transition-colors hover:bg-muted hover:text-foreground'>When is my next meeting?</span>
                                    </div>
                                </>
                            )}
                        </div>
                    )}
                    <form onSubmit={handleFormSubmit} className="relative flex w-full">
                        <input
                            type="text"
                            onChange={handleInputChange}
                            value={input}
                            className="relative h-9 min-w-0 flex-grow rounded-full border bg-muted/40 px-3.5 text-[13px] outline-none transition-shadow placeholder:text-muted-foreground focus-visible:border-brand/40 focus-visible:bg-background focus-visible:ring-4 focus-visible:ring-brand/10"
                            placeholder="Ask anything…"
                        />
                        <motion.div
                            key={messages.length}
                            layout="position"
                            className="pointer-events-none absolute z-10 flex h-9 max-w-[calc(100%-2.75rem)] items-center overflow-hidden break-words rounded-full bg-muted [word-break:break-word]"
                            layoutId={`container-[${messages.length}]`}
                            transition={transitionDebug}
                            initial={{ opacity: 0.6, zIndex: -1 }}
                            animate={{ opacity: 0.6, zIndex: -1 }}
                            exit={{ opacity: 1, zIndex: 1 }}
                        >
                            <div className="px-3 py-2 text-[13px] leading-[15px]">
                                {input}
                            </div>
                        </motion.div>
                        <button
                            type="submit"
                            disabled={!accountId || isLoading || !input.trim()}
                            className={cn(
                                "ml-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand text-brand-foreground shadow-sm transition-opacity",
                                (!accountId || isLoading || !input.trim()) && "opacity-40 cursor-not-allowed"
                            )}
                        >
                            <Send className={cn("size-4", isLoading && "animate-pulse")} />
                        </button>
                    </form>
                </div>
            </motion.div>
        </div>
    )
}

export default AskAI