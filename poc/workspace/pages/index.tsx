import React, { useState, useEffect } from 'react';
import Head from 'next/head';

// Helper component for staggered animations
const AnimatedDiv: React.FC<{ children: React.ReactNode; delay?: number; className?: string }> = ({ 
  children, 
  delay = 0, 
  className = "" 
}) => (
  <div
    className={`animate-fade-in-up ${className}`}
    style={{ animationDelay: `${delay * 100}ms` }}
  >
    {children}
  </div>
);

// Feature Component
const FeatureCard: React.FC<{ title: string; description: string; icon: string; delay: number }> = ({ 
  title, 
  description, 
  icon, 
  delay 
}) => (
  <AnimatedDiv delay={delay}>
    <div className="glass group p-8 rounded-3xl border border-white/5 hover:border-violet-500/30 transition-all duration-500 hover:-translate-y-2 hover:shadow-[0_0_40px_rgba(139,92,246,0.1)]">
      <div className="w-14 h-14 rounded-2xl bg-violet-500/10 flex items-center justify-center text-3xl mb-6 group-hover:scale-110 group-hover:bg-violet-500/20 transition-transform duration-300">
        {icon}
      </div>
      <h3 className="text-xl font-bold mb-3 font-display">{title}</h3>
      <p className="text-gray-400 leading-relaxed">{description}</p>
    </div>
  </AnimatedDiv>
);

// Mock IDE Component
const MockIDE = () => {
  const [activeFile, setActiveFile] = useState('App.tsx');
  
  return (
    <div className="glass rounded-2xl border border-white/10 shadow-2xl overflow-hidden max-w-4xl mx-auto mt-20 animate-float relative z-20">
      {/* Title Bar */}
      <div className="bg-black/40 px-4 py-3 border-b border-white/5 flex items-center justify-between">
        <div className="flex gap-2">
          <div className="w-3 h-3 rounded-full bg-red-500/50"></div>
          <div className="w-3 h-3 rounded-full bg-yellow-500/50"></div>
          <div className="w-3 h-3 rounded-full bg-green-500/50"></div>
        </div>
        <div className="text-xs text-gray-500 font-mono">cogitare-ide — {activeFile}</div>
        <div className="w-12"></div>
      </div>
      
      <div className="flex h-[400px]">
        {/* Sidebar */}
        <div className="w-48 bg-black/20 border-r border-white/5 p-4 hidden md:block">
          <div className="text-[10px] uppercase tracking-widest text-gray-600 font-bold mb-4">Explorer</div>
          <div className="space-y-2">
            {['App.tsx', 'index.html', 'styles.css', 'package.json'].map(file => (
              <div 
                key={file}
                onClick={() => setActiveFile(file)}
                className={`text-sm cursor-pointer px-2 py-1 rounded transition-colors ${activeFile === file ? 'bg-violet-500/20 text-violet-300' : 'text-gray-500 hover:bg-white/5 hover:text-gray-300'}`}
              >
                {file}
              </div>
            ))}
          </div>
        </div>
        
        {/* Editor Area */}
        <div className="flex-1 p-6 font-mono text-sm overflow-hidden relative">
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <div className="text-8xl font-bold text-violet-500">{"{ }"}</div>
          </div>
          <div className="space-y-1">
            <div className="flex gap-4"><span className="text-gray-600 w-4 text-right">1</span><span className="text-pink-400">import</span> <span className="text-blue-300">React</span> <span className="text-pink-400">from</span> <span className="text-green-300">'react'</span>;</div>
            <div className="flex gap-4"><span className="text-gray-600 w-4 text-right">2</span><span className="text-pink-400">import</span> <span className="text-white">{"{ Cloudflare }"}</span> <span className="text-pink-400">from</span> <span className="text-green-300">'@providers'</span>;</div>
            <div className="flex gap-4"><span className="text-gray-600 w-4 text-right">3</span>&nbsp;</div>
            <div className="flex gap-4"><span className="text-gray-600 w-4 text-right">4</span><span className="text-pink-400">export default function</span> <span className="text-yellow-300">WebIDE</span>() {"{"}</div>
            <div className="flex gap-4"><span className="text-gray-600 w-4 text-right">5</span>&nbsp;&nbsp;<span className="text-pink-400">return</span> (</div>
            <div className="flex gap-4"><span className="text-gray-600 w-4 text-right">6</span>&nbsp;&nbsp;&nbsp;&nbsp;{"<"}<span className="text-blue-300">div</span> <span className="text-yellow-200">className</span>=<span className="text-green-300">"future"</span>{">"}</div>
            <div className="flex gap-4"><span className="text-gray-600 w-4 text-right">7</span>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Deploying to the edge...</div>
            <div className="flex gap-4"><span className="text-gray-600 w-4 text-right">8</span>&nbsp;&nbsp;&nbsp;&nbsp;{"</"}<span className="text-blue-300">div</span>{">"}</div>
            <div className="flex gap-4"><span className="text-gray-600 w-4 text-right">9</span>&nbsp;&nbsp;);</div>
            <div className="flex gap-4"><span className="text-gray-600 w-4 text-right">10</span>{"}"}</div>
          </div>
          
          <div className="mt-8 pt-4 border-t border-white/5">
            <div className="text-xs text-violet-400 mb-2 font-bold uppercase tracking-widest">Console</div>
            <div className="text-green-400 text-xs">$ npm run deploy</div>
            <div className="text-gray-400 text-xs">✓ Optimized build completed in 1.2s</div>
            <div className="text-gray-400 text-xs">✓ Uploading to Cloudflare Workers...</div>
            <div className="text-blue-400 text-xs">🚀 Project live at https://my-app.workers.dev</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default function Home() {
  const features = [
    { title: 'Edge Runtime', description: 'Experience the lowest latency with global edge deployments.', icon: '⚡' },
    { title: 'AI Pair Programming', description: 'Next-gen code suggestions that understand your context.', icon: '🤖' },
    { title: 'Cloudflare Native', description: 'First-class support for Workers, Pages, and KV storage.', icon: '☁️' },
    { title: 'Zero Config', description: 'Start coding instantly with our pre-configured environments.', icon: '🛠️' },
    { title: 'Real-time Sync', description: 'Collaborate with your team as if you were in the same room.', icon: '👯' },
    { title: 'Git Integrated', description: 'Seamless workflow with GitHub, GitLab, and Bitbucket.', icon: '🐙' },
  ];

  return (
    <div className="min-h-screen text-white font-sans antialiased overflow-x-hidden selection:bg-violet-500/30">
      <Head>
        <title>Web IDE | The Future of Edge Development</title>
        <meta name="description" content="AI-powered, cloud-native development environment optimized for the edge." />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      {/* Hero Background Glows */}
      <div className="fixed inset-0 pointer-events-none -z-10">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-violet-600/20 blur-[120px] rounded-full animate-pulse-slow"></div>
        <div className="absolute bottom-[0%] right-[-10%] w-[40%] h-[40%] bg-pink-600/10 blur-[120px] rounded-full"></div>
        <div className="bg-grid absolute inset-0 opacity-20"></div>
        <div className="bg-radial absolute inset-0"></div>
      </div>

      {/* Navigation */}
      <header className="fixed top-0 left-0 right-0 z-50 px-6 py-6 pointer-events-none">
        <div className="max-w-7xl mx-auto flex items-center justify-between pointer-events-auto glass px-6 py-4 rounded-2xl border border-white/10 shadow-xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-pink-500 flex items-center justify-center shadow-lg shadow-violet-500/20">
              <span className="text-xl font-bold font-display">W</span>
            </div>
            <span className="font-bold text-xl font-display tracking-tight">Web IDE</span>
          </div>
          
          <nav className="hidden md:flex items-center gap-8">
            <a href="#features" className="text-sm font-medium text-gray-400 hover:text-white transition-colors">Features</a>
            <a href="#showcase" className="text-sm font-medium text-gray-400 hover:text-white transition-colors">Showcase</a>
            <a href="#docs" className="text-sm font-medium text-gray-400 hover:text-white transition-colors">Docs</a>
            <div className="h-4 w-[1px] bg-white/10"></div>
            <a href="#" className="text-sm font-medium hover:text-violet-300 transition-colors">Login</a>
            <a 
              href="#" 
              className="bg-white text-black px-5 py-2 rounded-xl text-sm font-bold hover:bg-violet-500 hover:text-white transition-all duration-300"
            >
              Get Started
            </a>
          </nav>

          <button className="md:hidden glass p-2 rounded-lg">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16m-7 6h7"></path></svg>
          </button>
        </div>
      </header>

      <main className="pt-32 pb-24 px-6 relative">
        {/* Hero Section */}
        <div className="max-w-7xl mx-auto text-center">
          <AnimatedDiv delay={1} className="flex justify-center mb-8">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass border border-white/10 text-xs font-bold tracking-widest uppercase text-violet-300">
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-violet-500"></span>
              </span>
              v2.0 Beta is now available
            </div>
          </AnimatedDiv>
          
          <AnimatedDiv delay={2}>
            <h1 className="text-6xl md:text-8xl font-black font-display tracking-tighter mb-8 leading-[0.9]">
              Code. Build. <br />
              <span className="gradient-text">Deploy at Scale.</span>
            </h1>
          </AnimatedDiv>
          
          <AnimatedDiv delay={3}>
            <p className="text-xl md:text-2xl text-gray-400 max-w-2xl mx-auto mb-12 font-medium leading-relaxed">
              The only browser-based IDE optimized for edge runtimes. Integrated AI, real-time collaboration, and one-click cloud deployments.
            </p>
          </AnimatedDiv>
          
          <AnimatedDiv delay={4} className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <a
              href="#"
              className="w-full sm:w-auto px-10 py-5 bg-gradient-to-br from-violet-600 to-pink-600 text-white rounded-2xl font-bold shadow-[0_0_30px_rgba(139,92,246,0.4)] hover:scale-105 transition-transform duration-300 flex items-center justify-center gap-2 group"
            >
              <span>Start Building Free</span>
              <svg className="w-5 h-5 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7l5 5m0 0l-5 5m5-5H6"></path></svg>
            </a>
            <a
              href="#"
              className="w-full sm:w-auto px-10 py-5 glass border border-white/10 text-white rounded-2xl font-bold hover:bg-white/10 transition-colors"
            >
              View Documentation
            </a>
          </AnimatedDiv>

          {/* Interactive IDE Mockup */}
          <AnimatedDiv delay={6}>
            <MockIDE />
          </AnimatedDiv>

          {/* Social Proof */}
          <AnimatedDiv delay={8} className="mt-20">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-8">Trusted by developers from</p>
            <div className="flex flex-wrap justify-center items-center gap-8 md:gap-16 opacity-30 grayscale hover:grayscale-0 transition-all duration-500">
              <span className="text-2xl font-black font-display tracking-tighter">CLOUD.FLARE</span>
              <span className="text-2xl font-black font-display tracking-tighter">REACT.SYS</span>
              <span className="text-2xl font-black font-display tracking-tighter">VERCEL.IO</span>
              <span className="text-2xl font-black font-display tracking-tighter">STRIPE</span>
            </div>
          </AnimatedDiv>
        </div>

        {/* Features Section */}
        <section id="features" className="max-w-7xl mx-auto mt-40">
          <div className="text-center mb-20">
            <h2 className="text-violet-400 text-sm font-bold tracking-widest uppercase mb-4">Core Capabilities</h2>
            <p className="text-4xl md:text-5xl font-black font-display tracking-tight">Everything you need to ship.</p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-6">
            {features.map((feature, index) => (
              <FeatureCard 
                key={index} 
                title={feature.title} 
                description={feature.description} 
                icon={feature.icon} 
                delay={index + 1}
              />
            ))}
          </div>
        </section>

        {/* Quote Section */}
        <section className="max-w-5xl mx-auto mt-40 text-center relative">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[200px] font-black text-white/5 select-none -z-10 font-display">"</div>
          <AnimatedDiv delay={2}>
            <h2 className="text-3xl md:text-5xl font-bold leading-tight mb-12">
              "The speed at which we went from concept to edge deployment using Web IDE was nothing short of miraculous. It's the future."
            </h2>
            <div className="flex items-center justify-center gap-4">
              <div className="w-14 h-14 rounded-full bg-gradient-to-br from-violet-500 to-pink-500 p-[2px]">
                <div className="w-full h-full rounded-full bg-black flex items-center justify-center overflow-hidden">
                   {/* Placeholder for avatar */}
                   <span className="text-xl">👩‍💻</span>
                </div>
              </div>
              <div className="text-left">
                <div className="font-bold">Sarah Chen</div>
                <div className="text-sm text-gray-500 font-medium">Lead Engineer at Veloctiy Edge</div>
              </div>
            </div>
          </AnimatedDiv>
        </section>

        {/* Final CTA */}
        <section className="max-w-7xl mx-auto mt-40">
          <div className="glass p-12 md:p-24 rounded-[40px] border border-white/5 relative overflow-hidden text-center">
            <div className="absolute top-[-20%] left-[-10%] w-[40%] h-[80%] bg-violet-600/20 blur-[100px] rounded-full"></div>
            <div className="absolute bottom-[-20%] right-[-10%] w-[40%] h-[80%] bg-pink-600/20 blur-[100px] rounded-full"></div>
            
            <div className="relative z-10">
              <h2 className="text-4xl md:text-7xl font-black font-display tracking-tight mb-8">Ready to build the future?</h2>
              <p className="text-xl text-gray-400 max-w-2xl mx-auto mb-12 font-medium">
                Join 50,000+ developers building modern edge applications with Web IDE. Start your project for free today.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
                <a
                  href="#"
                  className="w-full sm:w-auto px-12 py-6 bg-white text-black rounded-2xl font-bold text-lg hover:scale-105 transition-transform duration-300 animate-pulse-glow"
                >
                  Create Your Free Account
                </a>
                <a href="#" className="text-white font-bold hover:text-violet-400 transition-colors">
                  Contact Sales &rarr;
                </a>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/5 bg-black/40 pt-24 pb-12 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-4 gap-12 mb-20">
            <div className="col-span-1 md:col-span-1">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-pink-500 flex items-center justify-center">
                  <span className="text-sm font-bold font-display">W</span>
                </div>
                <span className="font-bold text-lg font-display tracking-tight">Web IDE</span>
              </div>
              <p className="text-gray-500 text-sm leading-relaxed mb-8">
                The next-generation development platform for edge runtimes and AI-powered applications.
              </p>
            </div>
            
            <div>
              <h4 className="font-bold mb-6 text-sm uppercase tracking-widest text-white/50">Product</h4>
              <ul className="space-y-4 text-sm text-gray-500 font-medium">
                <li><a href="#" className="hover:text-white transition-colors">Features</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Integrations</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Pricing</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Changelog</a></li>
              </ul>
            </div>

            <div>
              <h4 className="font-bold mb-6 text-sm uppercase tracking-widest text-white/50">Resources</h4>
              <ul className="space-y-4 text-sm text-gray-500 font-medium">
                <li><a href="#" className="hover:text-white transition-colors">Documentation</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Guides</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Community</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Support</a></li>
              </ul>
            </div>

            <div>
              <h4 className="font-bold mb-6 text-sm uppercase tracking-widest text-white/50">Company</h4>
              <ul className="space-y-4 text-sm text-gray-500 font-medium">
                <li><a href="#" className="hover:text-white transition-colors">About Us</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Privacy Policy</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Terms of Service</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Contact</a></li>
              </ul>
            </div>
          </div>
          
          <div className="flex flex-col md:flex-row items-center justify-between pt-12 border-t border-white/5 gap-6">
            <p className="text-gray-600 text-xs font-medium">
              &copy; {new Date().getFullYear()} Web IDE Labs Inc. All rights reserved.
            </p>
            <div className="flex gap-8">
               <a href="#" className="text-gray-600 hover:text-white transition-colors"><span className="sr-only">Twitter</span>𝕏</a>
               <a href="#" className="text-gray-600 hover:text-white transition-colors"><span className="sr-only">GitHub</span>🐙</a>
               <a href="#" className="text-gray-600 hover:text-white transition-colors"><span className="sr-only">Discord</span>💬</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
