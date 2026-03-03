'use client';

import { AlertTriangle, Check, Loader2, Mic, Square, Trash2, X } from 'lucide-react';
import React, { useRef, useState } from 'react';

interface AudioRecorderProps {
  onRecordingComplete: (audioBlob: Blob) => void;
  onCancel: () => void;
}

export function AudioRecorder({ onRecordingComplete, onCancel }: AudioRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioLevel, setAudioLevel] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const monitorAudioLevel = (stream: MediaStream) => {
    const audioContext = new AudioContext();
    const analyser = audioContext.createAnalyser();
    const microphone = audioContext.createMediaStreamSource(stream);

    analyser.fftSize = 256;
    microphone.connect(analyser);

    audioContextRef.current = audioContext;
    analyserRef.current = analyser;

    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    const checkLevel = () => {
      if (!analyserRef.current) return;

      analyserRef.current.getByteFrequencyData(dataArray);
      const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
      setAudioLevel(average);

      animationFrameRef.current = requestAnimationFrame(checkLevel);
    };

    checkLevel();
  };

  const startRecording = async () => {
    try {
      console.log('Requesting microphone access...');

      // Try simple audio first - the complex constraints might be causing issues
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true
      });

      console.log('Microphone access granted. Stream:', stream);
      console.log('Audio tracks:', stream.getAudioTracks());

      // Monitor audio levels
      monitorAudioLevel(stream);

      // Try different MIME types in order of preference
      let mimeType = 'audio/webm';
      if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
        mimeType = 'audio/webm;codecs=opus';
      } else if (MediaRecorder.isTypeSupported('audio/webm')) {
        mimeType = 'audio/webm';
      } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
        mimeType = 'audio/mp4';
      } else if (MediaRecorder.isTypeSupported('audio/ogg')) {
        mimeType = 'audio/ogg';
      }

      console.log('Using MIME type:', mimeType);

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: mimeType,
      });

      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          console.log('Audio chunk received:', e.data.size, 'bytes');
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        console.log('Recording stopped. Total blob size:', blob.size, 'bytes');

        if (blob.size < 10000) {
          alert('Warning: Recording is very small (' + blob.size + ' bytes). Please check your microphone settings and try again.');
        }

        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        setAudioBlob(blob);

        // Stop audio monitoring
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
        }
        if (audioContextRef.current) {
          audioContextRef.current.close();
        }

        // Stop all tracks
        stream.getTracks().forEach(track => track.stop());
      };

      // Start recording - request data every 100ms for better capture
      mediaRecorder.start(100);
      setIsRecording(true);
      setRecordingTime(0);

      console.log('Recording started');

      // Start timer
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);

    } catch (error) {
      console.error('Error accessing microphone:', error);
      alert('Could not access microphone. Please check your browser permissions and microphone settings, then try again.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);

      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  };

  const handleConfirm = () => {
    if (audioBlob) {
      // Minimum 5 seconds recommended for voice cloning
      if (recordingTime < 5) {
        alert('Recording is too short! Please record at least 5 seconds for better voice cloning quality. 10+ seconds recommended.');
        return;
      }
      console.log('Confirming recording:', {
        duration: recordingTime,
        size: audioBlob.size,
        type: audioBlob.type
      });
      onRecordingComplete(audioBlob);
    }
  };

  const handleDiscard = () => {
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
    }
    setAudioUrl(null);
    setAudioBlob(null);
    setRecordingTime(0);
  };

  const cleanup = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }
  };

  // Cleanup on unmount
  React.useEffect(() => {
    return () => cleanup();
  }, []);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 rounded-2xl border border-slate-700 p-8 max-w-md w-full space-y-6">
        <div className="flex justify-between items-center">
          <h3 className="text-xl font-semibold text-white">Record Voice Sample</h3>
          <button
            onClick={onCancel}
            className="text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {!audioUrl ? (
          <div className="space-y-6">
            <div className="flex flex-col items-center justify-center py-12">
              {isRecording ? (
                <>
                  <div className="relative mb-6">
                    <div className="absolute inset-0 bg-red-500 rounded-full animate-ping opacity-75" />
                    <Mic className="w-16 h-16 text-red-500 relative z-10" />
                  </div>
                  <p className="text-2xl font-mono text-white mb-2">{formatTime(recordingTime)}</p>
                  <p className="text-sm text-slate-400 mb-4">Recording in progress...</p>

                  {/* Audio Level Indicator */}
                  <div className="w-full max-w-xs mx-auto space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-500">Audio Level</span>
                      <span className={`flex items-center gap-1 ${audioLevel > 5 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {audioLevel > 5 ? (
                          <><Check className="w-3 h-3" /> Detecting sound</>
                        ) : (
                          <><AlertTriangle className="w-3 h-3" /> No sound detected</>
                        )}
                      </span>
                    </div>
                    <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                      <div
                        className={`h-full transition-all duration-100 ${
                          audioLevel > 5 ? 'bg-emerald-500' : 'bg-red-500'
                        }`}
                        style={{ width: `${Math.min(audioLevel * 2, 100)}%` }}
                      />
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <Mic className="w-16 h-16 text-slate-500 mb-6" />
                  <p className="text-sm text-slate-400 text-center mb-4">
                    Click the button below to start recording your voice sample.<br />
                    <span className="text-xs text-slate-500">Minimum 10 seconds recommended for best results</span>
                  </p>
                </>
              )}
            </div>

            <div className="flex gap-3">
              {isRecording ? (
                <button
                  onClick={stopRecording}
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white font-medium py-3 px-6 rounded-xl transition-colors flex items-center justify-center gap-2"
                >
                  <Square className="w-5 h-5" />
                  Stop Recording
                </button>
              ) : (
                <>
                  <button
                    onClick={onCancel}
                    className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium py-3 px-6 rounded-xl transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={startRecording}
                    className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-3 px-6 rounded-xl transition-colors flex items-center justify-center gap-2"
                  >
                    <Mic className="w-5 h-5" />
                    Start Recording
                  </button>
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="bg-slate-800 rounded-xl p-6 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-400">Duration</span>
                <div className="flex items-center gap-2">
                  <span className={`text-lg font-mono ${recordingTime >= 10 ? 'text-emerald-400' : recordingTime >= 5 ? 'text-yellow-400' : 'text-red-400'}`}>
                    {formatTime(recordingTime)}
                  </span>
                  {recordingTime < 5 && (
                    <span className="text-xs text-red-400">Too short!</span>
                  )}
                  {recordingTime >= 5 && recordingTime < 10 && (
                    <span className="text-xs text-yellow-400">Good</span>
                  )}
                  {recordingTime >= 10 && (
                    <span className="text-xs text-emerald-400">Excellent!</span>
                  )}
                </div>
              </div>
              <audio controls src={audioUrl} className="w-full" />
            </div>

            {recordingTime < 5 && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                <p className="text-xs text-red-400 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3 flex-shrink-0" /> Recording should be at least 5 seconds (10+ recommended) for good voice cloning quality.
                </p>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={handleDiscard}
                className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium py-3 px-6 rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                <Trash2 className="w-5 h-5" />
                Discard
              </button>
              <button
                onClick={handleConfirm}
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-3 px-6 rounded-xl transition-colors"
              >
                Use This Recording
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
