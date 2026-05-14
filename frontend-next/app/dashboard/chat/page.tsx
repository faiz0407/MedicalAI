import ChatInterface from '@/components/dashboard/ChatInterface'

export const metadata = { title: 'AI Assistant' }

export default function ChatPage() {
  return (
    <div className="h-full">
      <ChatInterface />
    </div>
  )
}
