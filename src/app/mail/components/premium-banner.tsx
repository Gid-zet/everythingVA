'use client'
import { motion } from 'framer-motion'
import React from 'react'
import StripeButton from './stripe-button'
import { api } from '@/trpc/react'
import { FREE_CREDITS_PER_DAY } from '@/app/constants'
import { getSubscriptionStatus } from '@/lib/stripe-actions'

const PremiumBanner = () => {
    const [isSubscribed, setIsSubscribed] = React.useState(false)
    React.useEffect(() => {
        (async () => {
            const subscriptionStatus = await getSubscriptionStatus()
            setIsSubscribed(subscriptionStatus)
        })()
    }, [])

    const { data: chatbotInteraction } = api.mail.getChatbotInteraction.useQuery()
    const remainingCredits = chatbotInteraction?.remainingCredits || 0

    if (isSubscribed) return (
        <motion.div layout className="relative overflow-hidden rounded-xl border bg-gradient-to-br from-zinc-900 to-zinc-800 p-3.5 text-white dark:from-zinc-900 dark:to-zinc-950">
            <div className="pointer-events-none absolute -right-8 -top-10 size-28 rounded-full bg-brand/40 blur-2xl" />
            <div className="relative flex items-center gap-2">
                <span className="rounded-md bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider">Pro</span>
                <p className="text-sm font-medium">Unlimited AI</p>
            </div>
            <p className="relative mt-1 text-xs text-white/60">Ask as many questions as you want.</p>
            <div className="relative mt-3"><StripeButton /></div>
        </motion.div>
    )

    const used = Math.max(0, FREE_CREDITS_PER_DAY - remainingCredits)
    const pct = Math.min(100, (used / FREE_CREDITS_PER_DAY) * 100)
    return (
        <motion.div layout className="relative overflow-hidden rounded-xl border bg-gradient-to-br from-zinc-900 to-zinc-800 p-3.5 text-white dark:from-zinc-900 dark:to-zinc-950">
            <div className="pointer-events-none absolute -right-8 -top-10 size-28 rounded-full bg-brand/40 blur-2xl" />
            <div className="relative flex items-baseline justify-between gap-2">
                <p className="text-sm font-medium">Free plan</p>
                <p className="text-[11px] tabular-nums text-white/60">{remainingCredits}/{FREE_CREDITS_PER_DAY} left today</p>
            </div>
            <div className="relative mt-2 h-1 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-brand transition-[width] duration-500" style={{ width: `${pct}%` }} />
            </div>
            <p className="relative mt-2 text-xs text-white/60">Upgrade for unlimited AI answers.</p>
            <div className="relative mt-3"><StripeButton /></div>
        </motion.div>
    )
}

export default PremiumBanner