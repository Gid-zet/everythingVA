'use client'
import { Button } from '@/components/ui/button'
import { createBillingPortalSession, createCheckoutSession, getSubscriptionStatus } from '@/lib/stripe-actions'
import React from 'react'

const StripeButton = () => {
    const [isSubscribed, setIsSubscribed] = React.useState(false)
    React.useEffect(() => {
        (async () => {
            const isSubscribed = await getSubscriptionStatus()
            setIsSubscribed(isSubscribed)
        })()
    }, [])

    const handleClick = async () => {
        if (!isSubscribed) {
            await createCheckoutSession()
        } else {
            await createBillingPortalSession()
        }
    }
    return (
        <Button size='sm' onClick={handleClick} className='h-8 w-full bg-white text-zinc-900 hover:bg-white/90'>{isSubscribed ? 'Manage Subscription' : 'Upgrade Plan'}</Button>
    )
}

export default StripeButton