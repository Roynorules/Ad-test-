import React, { useState, useEffect, useRef } from 'react';
import fluidPlayer from 'fluid-player';
import 'fluid-player/src/css/fluidplayer.css';
import { Play, CheckCircle2, XCircle, Loader2, Info, RefreshCw, Trash2, Copy, Tv } from 'lucide-react';

// --- Global Interceptors ---
// We define these outside the component so they attach once and survive re-renders.
type LogEntry = { type: string; message: string; timestamp: string };
let consoleListeners: ((log: LogEntry) => void)[] = [];
let networkListeners: ((req: NetworkRequest) => void)[] = [];

type NetworkRequest = {
  url: string;
  method: string;
  status: number;
  responseText: string;
  duration?: number;
};

// Intercept Console
const originalConsole = {
  log: console.log,
  warn: console.warn,
  error: console.error,
  info: console.info,
};

['log', 'warn', 'error', 'info'].forEach((level) => {
  (console as any)[level] = (...args: any[]) => {
    (originalConsole as any)[level].apply(console, args);
    const message = args
      .map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a)))
      .join(' ');
    const log = { type: level, message, timestamp: new Date().toLocaleTimeString() };
    consoleListeners.forEach((l) => l(log));
  };
});

// Intercept Fetch
const originalFetch = window.fetch;
const customFetch = async function (this: any, ...args: any[]) {
  const startTime = performance.now();
  const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || 'unknown';
  const method = (args[1]?.method || 'GET').toUpperCase();
  try {
    const response = await originalFetch.apply(this, args as any);
    const clone = response.clone();
    const text = await clone.text().catch(() => '');
    const duration = Math.round(performance.now() - startTime);
    const req = { url, method, status: response.status, responseText: text, duration };
    networkListeners.forEach((l) => l(req));
    return response;
  } catch (e: any) {
    const duration = Math.round(performance.now() - startTime);
    const req = { url, method, status: 0, responseText: e.message || 'Network Error', duration };
    networkListeners.forEach((l) => l(req));
    throw e;
  }
};

try {
  Object.defineProperty(window, 'fetch', {
    value: customFetch,
    configurable: true,
    writable: true,
  });
} catch (e) {
  console.warn('Failed to defineProperty on fetch', e);
}

// Intercept XHR
const originalOpen = XMLHttpRequest.prototype.open;
const originalSend = XMLHttpRequest.prototype.send;
XMLHttpRequest.prototype.open = function (method: string, url: string, ...args: any[]) {
  (this as any)._url = url;
  (this as any)._method = method;
  return originalOpen.apply(this, [method, url, ...args]);
};
XMLHttpRequest.prototype.send = function (...args: any[]) {
  (this as any)._startTime = performance.now();
  this.addEventListener('load', function () {
    const duration = Math.round(performance.now() - (this as any)._startTime);
    const req = {
      url: (this as any)._url,
      method: (this as any)._method,
      status: this.status,
      responseText: this.responseText,
      duration,
    };
    networkListeners.forEach((l) => l(req));
  });
  this.addEventListener('error', function () {
    const duration = Math.round(performance.now() - (this as any)._startTime);
    const req = {
      url: (this as any)._url,
      method: (this as any)._method,
      status: 0,
      responseText: 'Network Error',
      duration,
    };
    networkListeners.forEach((l) => l(req));
  });
  return originalSend.apply(this, args);
};


// --- Component ---
export default function App() {
  const [scriptInput, setScriptInput] = useState('<script async src="https://js.onclckmn.com/static/onclicka.js" data-admpid="447218"></script>');
  const [bannerSpotId, setBannerSpotId] = useState('6122185');
  const [vastInput, setVastInput] = useState('');
  
  const [isRunning, setIsRunning] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [networkLogs, setNetworkLogs] = useState<NetworkRequest[]>([]);
  
  const [results, setResults] = useState({
    scriptLoaded: false,
    containerFound: false,
    sdkInitialized: false,
    requestSent: false,
    requestUrl: '',
    httpStatus: null as number | null,
    responsePreview: '',
    adRendered: false,
    failureReason: '',
    completed: false,
    fillStatus: '',
    currentDomain: window.location.hostname,
    spotId: '',
    publisherId: '',
  });

  const [videoResults, setVideoResults] = useState({
    vastUrlLoaded: false,
    adRequestSent: false,
    httpStatus: null as number | null,
    videoAdStarted: false,
    videoAdCompleted: false,
    failureReason: '',
  });

  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const logListener = (log: LogEntry) => {
      setLogs((prev) => [...prev, log]);
    };
    const netListener = (req: NetworkRequest) => {
      setNetworkLogs((prev) => [...prev, req]);
    };
    consoleListeners.push(logListener);
    networkListeners.push(netListener);
    return () => {
      consoleListeners = consoleListeners.filter((l) => l !== logListener);
      networkListeners = networkListeners.filter((l) => l !== netListener);
    };
  }, []);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const runTest = async () => {
    const hasBanner = scriptInput.trim().length > 0;
    const hasVast = vastInput.trim().length > 0;

    if (!hasBanner && !hasVast) {
      alert('Please provide a Banner Script or VAST URL.');
      return;
    }

    setIsRunning(true);
    setLogs([]);
    setNetworkLogs([]);
    
    setResults({
      scriptLoaded: false,
      containerFound: false,
      sdkInitialized: false,
      requestSent: false,
      requestUrl: '',
      httpStatus: null,
      responsePreview: '',
      adRendered: false,
      failureReason: '',
      completed: false,
      fillStatus: '',
      currentDomain: window.location.hostname,
      spotId: '',
      publisherId: '',
    });

    setVideoResults({
      vastUrlLoaded: false,
      adRequestSent: false,
      httpStatus: null,
      videoAdStarted: false,
      videoAdCompleted: false,
      failureReason: '',
    });

    console.log('--- Starting New Test ---');

    // 1. Clear preview stage
    const previewStage = document.getElementById('onclicka-preview-stage');
    if (previewStage) {
      previewStage.innerHTML = '';
      // re-add the placeholder text so it looks nice before the ad renders
      const placeholder = document.createElement('span');
      placeholder.className = "text-gray-400 font-medium absolute z-0 pointer-events-none";
      placeholder.textContent = "Ad preview will appear here";
      previewStage.appendChild(placeholder);
      console.log('Cleared preview stage.');
    }

    // 2. Banner Logic
    if (hasBanner) {
      await (async () => {
        const parser = new DOMParser();
        const doc = parser.parseFromString(scriptInput, 'text/html');
        const scriptTag = doc.querySelector('script');

        if (!scriptTag) {
          console.warn('Failed to parse <script> tag from input.');
          setResults((prev) => ({
            ...prev,
            completed: true,
            failureReason: 'Invalid Script Input (No <script> tag)',
          }));
          return;
        }

        let src = scriptTag.getAttribute('src') || '';
        let admpid = scriptTag.getAttribute('data-admpid') || scriptTag.getAttribute('data-zone') || '';
        
        if (!admpid) {
            const match = src.match(/\/(\d+)(?:\.js|$|\?)/);
            if (match) admpid = match[1];
        }

        if (!src) {
          console.warn('No src attribute found in the script tag.');
          setResults((prev) => ({
            ...prev,
            completed: true,
            failureReason: 'Missing src attribute',
          }));
          return;
        }

    // Try to guess Publisher ID / Zone from src if possible, though mostly Spot ID is what we have
    let publisherId = '';
    const pubMatch = scriptInput.match(/pub[=_-]?(\d+)/i) || src.match(/id=(\d+)/i);
    if (pubMatch) publisherId = pubMatch[1];
    
    const targetSpotId = bannerSpotId.trim() || admpid;
    setResults(prev => ({ ...prev, spotId: targetSpotId, publisherId }));

    console.log(`Extracted src: ${src}`);
    if (admpid) console.log(`Extracted loader ID (data-admpid): ${admpid}`);
    if (targetSpotId) console.log(`Using Banner Spot ID: ${targetSpotId}`);

    // Set up network listener before injection
    let capturedReq: NetworkRequest | null = null;
    let networkTimeout: any;

    const waitForNetwork = new Promise<NetworkRequest | null>((resolve) => {
      networkTimeout = setTimeout(() => {
        resolve(null);
      }, 20000);

      const netListener = (req: NetworkRequest) => {
        // Ignore local react/vite requests and extensions
        if (
          req.url.includes(window.location.host) ||
          req.url.includes('localhost') ||
          req.url.startsWith('chrome-extension') ||
          req.url.includes('google.com')
        ) {
          return;
        }
        
        // Prefer request containing targetSpotId, or fallback to any external request
        if (targetSpotId && req.url.includes(targetSpotId)) {
          console.log(`Captured relevant network request matching target ID: ${req.url}`);
          clearTimeout(networkTimeout);
          networkListeners = networkListeners.filter((l) => l !== netListener);
          resolve(req);
        } else if (!targetSpotId) {
          console.log(`Captured external network request: ${req.url}`);
          clearTimeout(networkTimeout);
          networkListeners = networkListeners.filter((l) => l !== netListener);
          resolve(req);
        }
      };
      networkListeners.push(netListener);
    });

    // 4. Inject non-script pasted elements, and proactively create standard mount targets
    let containerCreated = false;
    if (previewStage) {
      Array.from(doc.body.children).forEach(child => {
        if (child.tagName !== 'SCRIPT') {
          previewStage.appendChild(child.cloneNode(true));
          console.log(`Injected provided element: ${child.outerHTML}`);
        }
      });
      
      if (targetSpotId) {
        if (!previewStage.querySelector(`[data-banner-id="${targetSpotId}"]`)) {
          const bannerContainer = document.createElement('div');
          bannerContainer.setAttribute('data-banner-id', targetSpotId);
          previewStage.appendChild(bannerContainer);
          console.log(`Banner container created (data-banner-id="${targetSpotId}")`);
          containerCreated = true;
        } else {
          console.log('Banner container already exists');
          containerCreated = true;
        }
      }
    }
    setResults(prev => ({ ...prev, containerFound: containerCreated }));

    // 5. Inject script with exactly the same attributes
    console.log('Injecting loader script...');
    let finalSrc = src;
    if (finalSrc.startsWith('//')) finalSrc = 'https:' + finalSrc;
    
    const existingScript = document.head.querySelector(`script[src="${finalSrc}"]`) || (admpid ? document.head.querySelector(`script[data-admpid="${admpid}"]`) : null);
    
    let isLoaded = false;
    
    if (existingScript) {
      console.log('Loader already exists');
      isLoaded = true;
    } else {
      console.log('Loader script injected');
      const injectedScript = document.createElement('script');
      injectedScript.id = `onclicka-injected-${admpid || Date.now()}`;
      
      Array.from(scriptTag.attributes).forEach(attr => {
        if (attr.name === 'src') {
          injectedScript.setAttribute('src', finalSrc);
        } else {
          injectedScript.setAttribute(attr.name, attr.value);
        }
      });
      
      injectedScript.async = true;

      const scriptLoadedPromise = new Promise<boolean>((resolve) => {
        injectedScript.onload = () => resolve(true);
        injectedScript.onerror = () => resolve(false);
      });

      document.head.appendChild(injectedScript);

      isLoaded = await scriptLoadedPromise;
    }

    if (!isLoaded) {
      console.warn('Script injection failed (onerror triggered). This may be due to an Ad Blocker, a network issue, or an invalid URL.');
      clearTimeout(networkTimeout);
      setResults((prev) => ({
        ...prev,
        completed: true,
        failureReason: 'Script Load Failed (Check Ad Blocker / URL)',
      }));
      setIsRunning(false);
      return;
    }

    console.log('Script loaded successfully.');
    setResults((prev) => ({ ...prev, scriptLoaded: true }));

    // 6. Detect window.ocMan or window.a3klsam
    // Give it a small delay for sync initialization
    await new Promise((r) => setTimeout(r, 500));
    const isSdkInit = !!((window as any).ocMan || (window as any).a3klsam);
    if (isSdkInit) {
      console.log('SDK Initialization detected (window.ocMan or window.a3klsam found).');
    } else {
      console.warn('SDK globals not found. It might initialize asynchronously.');
    }
    setResults((prev) => ({ ...prev, sdkInitialized: isSdkInit }));

    let domRendered = false;
    const domObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'childList') {
          for (const node of Array.from(mutation.addedNodes)) {
            if (node.nodeName !== 'SCRIPT' && node.nodeType === Node.ELEMENT_NODE && node.nodeName !== 'SPAN') {
              domRendered = true;
              console.log('DOM node inserted by SDK:', node.nodeName);
            }
          }
        }
      }
    });

    if (previewStage) {
      domObserver.observe(previewStage, { childList: true, subtree: true });
    }

    // 7. & 8. Wait for network request (up to 20s)
    console.log('Waiting up to 20s for SDK network requests...');
    capturedReq = await waitForNetwork;
    
    // Give SDK a moment to actually render the DOM
    console.log('Waiting up to 2s for DOM rendering to complete...');
    await new Promise((r) => setTimeout(r, 2000));
    domObserver.disconnect();

    // Secondary DOM check
    if (!domRendered && targetSpotId) {
      const bannerContainer = document.querySelector(`[data-banner-id="${targetSpotId}"]`);
      if (bannerContainer && bannerContainer.children.length > 0) {
        domRendered = true;
        console.log('DOM node found inside banner container.');
      }
    }

    if (!capturedReq && !domRendered) {
      console.warn('Network timeout: No external requests detected within 20 seconds.');
      setResults((prev) => ({
        ...prev,
        completed: true,
        adRendered: false,
        failureReason: 'Network Timeout (No request sent)',
      }));
      setIsRunning(false);
      return;
    }

    if (capturedReq) {
      setResults((prev) => ({
        ...prev,
        requestSent: true,
        requestUrl: capturedReq.url,
        httpStatus: capturedReq.status,
        responsePreview:
          capturedReq.responseText.substring(0, 300) +
          (capturedReq.responseText.length > 300 ? '...' : ''),
      }));
    } else if (domRendered) {
      setResults((prev) => ({
        ...prev,
        requestSent: true,
        httpStatus: 200,
        responsePreview: 'Unknown (Captured via DOM Rendering)',
      }));
    }

    // 9. Analyze Response
    let reason = '';
    const status = capturedReq ? capturedReq.status : (domRendered ? 200 : 0);
    const bodyText = capturedReq ? (capturedReq.responseText || '') : '';
    const bodyLower = bodyText.toLowerCase();

    console.log(`Analyzing response... Status: ${status}`);

    let fillStatus = 'Unknown';

    if (status === 204) {
      reason = '204 No Content';
      fillStatus = 'No Fill';
    } else if (status === 403) {
      reason = '403 Forbidden';
      fillStatus = 'Forbidden';
      if (bodyLower.includes('geo')) reason = 'Geo Restricted';
      if (bodyLower.includes('domain')) reason = 'Domain Restricted';
    } else if (status === 400 || status === 404) {
      reason = 'Invalid Spot';
      fillStatus = 'Error';
    } else if (status === 200) {
      if (!bodyText.trim() || bodyText === '{}' || bodyText === '[]' || bodyLower.includes('no_fill') || bodyLower.includes('"fill":false')) {
        reason = 'No Fill';
        fillStatus = 'No Fill';
      } else if (bodyLower.includes('forbidden') || bodyLower.includes('restricted')) {
        reason = bodyLower.includes('geo') ? 'Geo Restricted' : 'Domain Restricted';
        fillStatus = 'Restricted';
      } else {
        fillStatus = 'Filled';
      }
    } else if (status === 0) {
      reason = capturedReq ? 'Network Error / CORS' : 'Network Timeout (No request sent)';
      fillStatus = 'Error';
    } else {
      reason = `HTTP ${status}`;
      fillStatus = 'Error';
    }

    if (domRendered) {
      console.log('Analysis Complete: Ad Rendered in DOM.');
      fillStatus = 'Filled';
    } else {
      if (!reason) reason = 'No DOM elements injected';
      console.warn(`Analysis Complete: No Ad Rendered. Reason: ${reason}`);
      if (fillStatus === 'Unknown' || fillStatus === 'Filled') fillStatus = 'No Fill';
    }

    setResults((prev) => ({
      ...prev,
      completed: true,
      adRendered: domRendered,
      failureReason: domRendered ? '' : reason,
      fillStatus,
    }));

      })();
    }

    if (hasVast) {
      await (async () => {
        console.log('--- Starting VAST Test ---');
        setVideoResults(prev => ({ ...prev, vastUrlLoaded: true }));
        
        const previewStage = document.getElementById('onclicka-preview-stage');
        if (previewStage) {
          const videoWrapper = document.createElement('div');
          videoWrapper.className = "mt-6 w-full relative";
          
          const videoEl = document.createElement('video');
          videoEl.id = `fluid-player-${Date.now()}`;
          videoEl.className = "w-full";
          videoEl.muted = true; // Required for reliable autoplay
          
          videoWrapper.appendChild(videoEl);
          previewStage.appendChild(videoWrapper);
          
          console.log('Video element created, initializing fluid-player...');
          
          try {
            const player = fluidPlayer(videoEl.id, {
              vastOptions: {
                adList: [{
                  roll: 'preRoll',
                  vastTag: vastInput.trim(),
                  adText: 'Ad'
                }]
              }
            });
            
            // Try to auto-play the ad
            setTimeout(() => {
                try {
                    if (player && typeof player.play === 'function') {
                        player.play();
                    } else {
                        videoEl.play().catch(e => console.warn('Auto-play prevented:', e));
                    }
                } catch (e) {
                    console.warn('Auto-play failed:', e);
                }
            }, 500);
            
            // Native video element events since fluid player uses it
            videoEl.addEventListener('play', () => {
               console.log('VAST: Ad started playing.');
               setVideoResults(prev => ({ 
                 ...prev, 
                 adRequestSent: true,
                 httpStatus: 200,
                 videoAdStarted: true 
               }));
            });
            
            videoEl.addEventListener('ended', () => {
               console.log('VAST: Video Ad Completed.');
               setVideoResults(prev => ({ ...prev, videoAdCompleted: true }));
            });
            
            videoEl.addEventListener('error', (e: any) => {
               console.warn('VAST Error:', e);
               setVideoResults(prev => ({ 
                 ...prev, 
                 failureReason: 'VAST Error or No Fill' 
               }));
            });
            
          } catch (err: any) {
            console.error('Failed to initialize fluid-player:', err);
            setVideoResults(prev => ({
               ...prev,
               failureReason: 'Failed to initialize player'
            }));
          }
        }
      })();
    }

    setIsRunning(false);
  };

  const clearPreview = () => {
    const existingScripts = document.querySelectorAll('script[id^="onclicka-injected"]');
    existingScripts.forEach(script => script.remove());
    
    const previewStage = document.getElementById('onclicka-preview-stage');
    if (previewStage) {
      previewStage.innerHTML = '';
      const placeholder = document.createElement('span');
      placeholder.className = "text-gray-400 font-medium absolute z-0 pointer-events-none";
      placeholder.textContent = "Ad preview will appear here";
      previewStage.appendChild(placeholder);
    }
    
    setLogs([]);
    setNetworkLogs([]);
    setResults({
      scriptLoaded: false,
      containerFound: false,
      sdkInitialized: false,
      requestSent: false,
      requestUrl: '',
      httpStatus: null,
      responsePreview: '',
      adRendered: false,
      failureReason: '',
      completed: false,
      fillStatus: '',
      currentDomain: window.location.hostname,
      spotId: '',
      publisherId: '',
    });
  };

  const copyDebugReport = () => {
    let report = `OnClickA Debug Report\n====================\n\n`;
    report += `Timestamp: ${new Date().toISOString()}\n`;
    report += `Domain: ${results.currentDomain}\n`;
    report += `Spot ID: ${results.spotId}\n`;
    report += `Publisher ID: ${results.publisherId}\n\n`;
    
    report += `Results:\n--------\n`;
    report += `Script Loaded: ${results.scriptLoaded}\n`;
    report += `SDK Initialized: ${results.sdkInitialized}\n`;
    report += `Request Sent: ${results.requestSent}\n`;
    report += `HTTP Status: ${results.httpStatus || 'N/A'}\n`;
    report += `Fill Status: ${results.fillStatus || 'N/A'}\n`;
    report += `Ad Rendered: ${results.adRendered}\n`;
    if (results.failureReason) report += `Failure Reason: ${results.failureReason}\n`;
    
    report += `\nConsole Logs:\n-------------\n`;
    logs.forEach(l => {
      report += `[${l.timestamp}] [${l.type.toUpperCase()}] ${l.message}\n`;
    });
    
    navigator.clipboard.writeText(report);
    alert('Debug report copied to clipboard!');
  };

  const StatusItem = ({ label, active, success, failMessage }: { label: string; active: boolean; success?: boolean; failMessage?: string }) => (
    <div className="flex items-start space-x-3 mb-4">
      <div className="mt-0.5">
        {!active && !failMessage && <div className="w-5 h-5 rounded-full border-2 border-gray-300" />}
        {active && success && <CheckCircle2 className="w-5 h-5 text-green-500" />}
        {active && !success && !failMessage && <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />}
        {failMessage && <XCircle className="w-5 h-5 text-red-500" />}
      </div>
      <div>
        <p className={`font-medium ${active || failMessage ? 'text-gray-900' : 'text-gray-400'}`}>
          {label}
        </p>
        {failMessage && <p className="text-sm text-red-500 mt-1">{failMessage}</p>}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 p-6 font-sans">
      <div className="max-w-7xl mx-auto space-y-6">
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight flex items-center">
            <Tv className="w-8 h-8 mr-3 text-blue-600" />
            Live Advertisement Preview
          </h1>
          <p className="text-gray-500 mt-2">Test the current script before saving or deploying.</p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column: Input and Actions */}
          <div className="lg:col-span-1 space-y-6">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Paste &lt;script&gt; Tag (Loader)
              </label>
              <textarea
                className="w-full h-24 p-3 font-mono text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none bg-gray-50"
                placeholder='<script src="https://example.com/ad.js" data-admpid="12345"></script>'
                value={scriptInput}
                onChange={(e) => setScriptInput(e.target.value)}
                disabled={isRunning}
              />
              
              <label className="block text-sm font-semibold text-gray-700 mt-4 mb-2">
                Banner Spot ID
              </label>
              <input
                type="text"
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm outline-none"
                placeholder="6122185"
                value={bannerSpotId}
                onChange={(e) => setBannerSpotId(e.target.value)}
                disabled={isRunning}
              />
              
              <div className="mt-6 border-t border-gray-200 pt-6">
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Video / In-Stream Ad (VAST URL)
                </label>
                <input
                  type="text"
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm outline-none"
                  placeholder="https://bid.onclckstr.com/vast?spot_id=6122191"
                  value={vastInput}
                  onChange={(e) => setVastInput(e.target.value)}
                  disabled={isRunning}
                />
              </div>
              
              <div className="mt-6 grid grid-cols-2 gap-3">
                <button
                  onClick={runTest}
                  disabled={isRunning}
                  className="col-span-2 flex items-center justify-center bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isRunning ? (
                    <>
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                      Testing...
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4 mr-2" />
                      Preview Ad
                    </>
                  )}
                </button>
                <button
                  onClick={runTest}
                  disabled={isRunning || !results.completed}
                  className="flex items-center justify-center bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-2 px-3 rounded-lg transition-colors disabled:opacity-50"
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Refresh
                </button>
                <button
                  onClick={clearPreview}
                  disabled={isRunning}
                  className="flex items-center justify-center bg-gray-100 hover:bg-red-50 text-gray-700 hover:text-red-600 font-medium py-2 px-3 rounded-lg transition-colors disabled:opacity-50"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Clear
                </button>
                <button
                  onClick={copyDebugReport}
                  className="col-span-2 flex items-center justify-center bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-2 px-3 rounded-lg transition-colors"
                >
                  <Copy className="w-4 h-4 mr-2" />
                  Copy Debug Report
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-gray-900 rounded-xl shadow-sm border border-gray-800 overflow-hidden flex flex-col h-[300px]">
                <div className="bg-gray-800 px-4 py-2 flex items-center justify-between border-b border-gray-700">
                  <span className="text-xs font-semibold text-gray-300 uppercase tracking-wider">Console</span>
                  <span className="text-xs text-green-400 animate-pulse">● Live</span>
                </div>
                <div className="p-4 flex-1 overflow-y-auto font-mono text-xs space-y-2">
                  {logs.length === 0 && <div className="text-gray-600 italic">No logs yet...</div>}
                  {logs.map((log, i) => (
                    <div
                      key={i}
                      className={`break-words ${
                        log.type === 'error' ? 'text-red-400' : log.type === 'warn' ? 'text-yellow-400' : 'text-gray-300'
                      }`}
                    >
                      <span className="text-gray-500 mr-2">[{log.timestamp}]</span>
                      {log.message}
                    </div>
                  ))}
                  <div ref={logsEndRef} />
                </div>
              </div>

              <div className="bg-gray-900 rounded-xl shadow-sm border border-gray-800 overflow-hidden flex flex-col h-[300px]">
                <div className="bg-gray-800 px-4 py-2 flex items-center justify-between border-b border-gray-700">
                  <span className="text-xs font-semibold text-gray-300 uppercase tracking-wider">Network Logger</span>
                  <span className="text-xs text-blue-400 animate-pulse">● Live</span>
                </div>
                <div className="p-4 flex-1 overflow-y-auto font-mono text-xs space-y-3">
                  {networkLogs.length === 0 && <div className="text-gray-600 italic">No network activity yet...</div>}
                  {networkLogs.map((req, i) => (
                    <div key={i} className="border-l-2 border-gray-700 pl-3 mb-3">
                      <div className="flex justify-between items-start text-gray-300 mb-1">
                        <span className="font-semibold text-blue-300">{req.method}</span>
                        <span className={req.status === 200 ? 'text-green-400' : 'text-red-400'}>{req.status || 'ERR'}</span>
                      </div>
                      <div className="text-gray-400 break-all mb-1">{req.url}</div>
                      <div className="text-gray-500 flex justify-between">
                        <span>Duration: {req.duration ? `${req.duration}ms` : '-'}</span>
                      </div>
                      {req.responseText && (
                        <div className="mt-2 text-gray-400 text-[10px] bg-gray-800 p-2 rounded max-h-16 overflow-y-auto">
                          {req.responseText.substring(0, 150)}{req.responseText.length > 150 ? '...' : ''}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
            
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h3 className="font-bold text-gray-900 mb-4 text-sm uppercase tracking-wider">Live Status</h3>
              
              {(scriptInput.trim() || !vastInput.trim()) && (
                <div className="space-y-3 mb-6">
                  <h4 className="font-semibold text-gray-700">Banner:</h4>
                  <StatusItem
                    label="Loader Script Loaded"
                    active={isRunning || results.completed || results.scriptLoaded}
                    success={results.scriptLoaded}
                  />
                  <StatusItem
                    label="Banner Container Found"
                    active={isRunning || results.completed || results.containerFound}
                    success={results.containerFound}
                  />
                  <StatusItem
                    label="Banner Rendered"
                    active={isRunning || results.completed}
                    success={results.adRendered}
                    failMessage={!isRunning && results.completed && !results.adRendered ? results.failureReason : undefined}
                  />
                </div>
              )}

              {vastInput.trim() && (
                <div className="space-y-3 mb-6 border-t border-gray-100 pt-4">
                  <h4 className="font-semibold text-gray-700">Video:</h4>
                  <StatusItem
                    label="VAST URL Loaded"
                    active={isRunning || videoResults.vastUrlLoaded}
                    success={videoResults.vastUrlLoaded}
                  />
                  <StatusItem
                    label="Ad Request Sent"
                    active={isRunning || videoResults.adRequestSent || videoResults.failureReason !== ''}
                    success={videoResults.adRequestSent}
                  />
                  <StatusItem
                    label="HTTP Status"
                    active={isRunning || videoResults.httpStatus !== null || videoResults.failureReason !== ''}
                    success={videoResults.httpStatus === 200}
                  />
                  <StatusItem
                    label="Video Ad Started"
                    active={videoResults.videoAdStarted || videoResults.failureReason !== ''}
                    success={videoResults.videoAdStarted}
                  />
                  <StatusItem
                    label="Video Ad Completed"
                    active={videoResults.videoAdCompleted || videoResults.failureReason !== ''}
                    success={videoResults.videoAdCompleted}
                    failMessage={videoResults.failureReason}
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-gray-100 text-sm">
                <div className="text-gray-500">Banner HTTP Status:</div>
                <div className="font-medium text-gray-900 text-right">{results.httpStatus || '-'}</div>
                
                <div className="text-gray-500">Video HTTP Status:</div>
                <div className="font-medium text-gray-900 text-right">{videoResults.httpStatus || '-'}</div>
                
                <div className="text-gray-500">Fill Status:</div>
                <div className="font-medium text-gray-900 text-right">{results.fillStatus || '-'}</div>
                
                <div className="text-gray-500">Current Domain:</div>
                <div className="font-medium text-gray-900 text-right truncate" title={results.currentDomain}>{results.currentDomain}</div>
                
                <div className="text-gray-500">Spot ID:</div>
                <div className="font-medium text-gray-900 text-right">{results.spotId || '-'}</div>

                <div className="text-gray-500">Publisher ID:</div>
                <div className="font-medium text-gray-900 text-right">{results.publisherId || '-'}</div>
              </div>
            </div>
          </div>

          {/* Middle & Right Column: Logs, Network, Results & Preview */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* Live Preview Area */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 flex flex-col">
              <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center">
                Live Ad Preview
              </h2>
              <div 
                id="onclicka-preview-stage" 
                className="w-full min-h-[150px] border-2 border-dashed border-gray-300 rounded-lg bg-gray-50 flex flex-col items-center justify-center relative overflow-hidden"
              >
                <span className="text-gray-400 font-medium absolute z-0 pointer-events-none">
                  Ad preview will appear here
                </span>
              </div>
            </div>

            {results.completed && (
              <div className={`p-4 rounded-xl border-2 ${results.adRendered ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
                <div className="flex items-center">
                  {results.adRendered ? <CheckCircle2 className="w-6 h-6 mr-3" /> : <XCircle className="w-6 h-6 mr-3" />}
                  <div>
                    <h3 className="font-bold text-lg">
                      {results.adRendered ? '✅ Advertisement Loaded Successfully' : `❌ ${results.failureReason || 'Failed to Render Ad'}`}
                    </h3>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
