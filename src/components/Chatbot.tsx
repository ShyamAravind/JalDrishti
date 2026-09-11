import React, { useState, useRef, useEffect } from 'react';
import { MessageCircle, X, Send, Bot } from 'lucide-react';
import { matchChatbotResponse } from '../utils/chatbotMatcher';
import { REFUSAL_MESSAGE } from '../data/chatbotKnowledgeBase';

interface ChatMessage {
  role: 'user' | 'bot';
  text: string;
}

const WELCOME_MESSAGE: ChatMessage = {
  role: 'bot',
  text: "Hi, I'm the JalDrishti assistant. I can answer questions about this app and watershed development — the Recommendation Engine, Trust Score, Impact Simulation, intervention types, and what's real vs. mock data. Ask away.",
};

const Chatbot: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME_MESSAGE]);
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed) return;

    const response = matchChatbotResponse(trimmed);
    setMessages(prev => [...prev, { role: 'user', text: trimmed }, { role: 'bot', text: response }]);
    setInput('');
  };

  return (
    <>
      {/* Floating toggle button */}
      <button
        onClick={() => setIsOpen(v => !v)}
        className="fixed bottom-5 right-5 z-[90] w-14 h-14 rounded-full bg-primary-600 hover:bg-primary-700 text-white shadow-lg flex items-center justify-center transition-colors"
        title="JalDrishti Assistant"
      >
        {isOpen ? <X className="w-6 h-6" /> : <MessageCircle className="w-6 h-6" />}
      </button>

      {isOpen && (
        <div className="fixed bottom-24 right-5 z-[90] w-96 max-w-[calc(100vw-2.5rem)] h-[480px] bg-white rounded-lg shadow-2xl border border-gray-200 flex flex-col overflow-hidden">
          <div className="bg-primary-600 text-white px-4 py-3 flex items-center gap-2 flex-shrink-0">
            <Bot className="w-5 h-5" />
            <div>
              <p className="text-sm font-bold leading-none">JalDrishti Assistant</p>
              <p className="text-[10px] text-primary-100 mt-0.5">Domain-restricted — watershed &amp; app questions only</p>
            </div>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-2.5 bg-surface-card">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] rounded-lg px-3 py-2 text-xs leading-relaxed ${
                    m.role === 'user'
                      ? 'bg-primary-600 text-white'
                      : m.text === REFUSAL_MESSAGE
                      ? 'bg-accent-50 border border-accent-200 text-accent-800'
                      : 'bg-white border border-gray-200 text-text-dark'
                  }`}
                >
                  {m.text}
                </div>
              </div>
            ))}
          </div>

          <div className="border-t border-gray-200 p-2.5 flex gap-2 flex-shrink-0">
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSend(); }}
              placeholder="Ask about JalDrishti..."
              className="flex-1 border border-gray-200 rounded px-2.5 py-1.5 text-xs focus:outline-none focus:border-primary-400"
            />
            <button
              onClick={handleSend}
              className="bg-primary-600 hover:bg-primary-700 text-white rounded px-3 flex items-center justify-center transition-colors"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export default Chatbot;
