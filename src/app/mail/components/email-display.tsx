'use client'
import { Letter } from 'react-letter';
import { type RouterOutputs } from '@/trpc/react'
import React from 'react'
import useThreads from '../use-threads';
import { cn } from '@/lib/utils';
import { format, formatDistanceToNowStrict } from 'date-fns';
import { SenderAvatar } from './sender-avatar';
import { AttachmentList } from './attachment-list';

type Props = {
    email: NonNullable<RouterOutputs['mail']['getThreadById']>['emails'][number]
    defaultOpen?: boolean
    accountId: string
}

const EmailDisplay = ({ email, defaultOpen = true, accountId }: Props) => {
    const { accounts } = useThreads()
    const account = accounts?.find((a) => a.id === accountId)
    const [open, setOpen] = React.useState(defaultOpen)
    const letterRef = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
        if (letterRef.current) {
            const gmailQuote = letterRef.current.querySelector('div[class*="_gmail_quote"]');
            if (gmailQuote) {
                gmailQuote.innerHTML = '';
            }
        }
    }, [email, open]);

    const isMe = account?.emailAddress === email.from.address
    const name = isMe ? 'You' : (email.from.name || email.from.address)
    const sentAt = new Date(email.sentAt)
    const recipients = email.to?.map(t => t.name || t.address).join(', ')

    return (
        <article className={cn(
            'overflow-hidden rounded-xl border bg-card shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-shadow',
            open ? 'shadow-[0_1px_3px_rgba(0,0,0,0.06)]' : 'hover:bg-foreground/[0.02]',
            isMe && 'border-brand/25',
        )}>
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                className="flex w-full items-start gap-3 px-4 py-3 text-left"
                aria-expanded={open}
            >
                <SenderAvatar name={name} email={email.from.address} size={34} />
                <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                        <span className="truncate text-[13px] font-semibold">{name}</span>
                        {!isMe && email.from.name && (
                            <span className="hidden truncate text-xs text-muted-foreground sm:inline">{email.from.address}</span>
                        )}
                        <time
                            className="ml-auto shrink-0 text-[11px] tabular-nums text-muted-foreground"
                            title={format(sentAt, 'PPpp')}
                        >
                            {format(sentAt, 'MMM d, h:mm a')} · {formatDistanceToNowStrict(sentAt, { addSuffix: true })}
                        </time>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {open ? (recipients ? `to ${recipients}` : '') : (email.bodySnippet ?? '').replace(/<[^>]*>/g, '')}
                    </p>
                </div>
            </button>
            {open && (
                <div ref={letterRef} className="px-4 pb-4">
                    {/* Email HTML is authored for a white canvas, so it stays on white in dark mode too. */}
                    <div className="overflow-x-auto rounded-lg bg-white p-4 text-[14px] leading-relaxed text-zinc-900 ring-1 ring-inset ring-black/5">
                        <Letter html={email?.body ?? email.bodySnippet ?? ""} />
                    </div>
                    {email.attachments.length > 0 && (
                        <AttachmentList accountId={accountId} messageId={email.id} attachments={email.attachments} />
                    )}
                </div>
            )}
        </article>
    )
}

export default EmailDisplay
