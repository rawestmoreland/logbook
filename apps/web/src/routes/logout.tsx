import { useAuthActions } from '#/contexts/auth-context'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useEffect } from 'react'

export const Route = createFileRoute('/logout')({
  component: RouteComponent,
})

function RouteComponent() {
  const router = useRouter()
  const { signOut } = useAuthActions()

  useEffect(() => {
    signOut()

    router.navigate({ to: '/sign-in' })
  }, [])

  return <div>Hello "/logout"!</div>
}
