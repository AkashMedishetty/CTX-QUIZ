/**
 * LobbyScreen - Big Screen lobby display component
 * 
 * Displays the lobby screen for the Big Screen with:
 * - Prominent join code (large, readable from distance)
 * - QR code for join URL
 * - Participant count
 * - Animated participant list (new participants animate in)
 * 
 * Responsive Design:
 * - Optimized for 16:9 and 4:3 aspect ratios
 * - Supports 1920x1080, 1280x720, 1024x768 resolutions
 * - Uses CSS Grid for layouts
 * 
 * Requirements: 12.8, 12.9
 */

'use client';

import { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';

/**
 * Participant info for display
 */
export interface LobbyParticipant {
  participantId: string;
  nickname: string;
}

/**
 * LobbyScreen props
 */
export interface LobbyScreenProps {
  /** Session join code */
  joinCode: string;
  /** Number of participants */
  participantCount: number;
  /** List of participants */
  participants: LobbyParticipant[];
  /** Whether the socket is connected */
  isConnected: boolean;
}

/**
 * Maximum number of participants to display in the grid
 */
const MAX_VISIBLE_PARTICIPANTS = 50;

/**
 * Join URL base
 */
const JOIN_URL_BASE = 'https://ctx.works/join';

/**
 * LobbyScreen component
 * 
 * Displays the lobby screen optimized for projector display with:
 * - Large, readable join code
 * - QR code for easy mobile joining
 * - Animated participant list
 * - Responsive design for multiple screen sizes
 */
export function LobbyScreen({
  joinCode,
  participantCount,
  participants,
  isConnected,
}: LobbyScreenProps) {
  // Generate join URL
  const joinUrl = `${JOIN_URL_BASE}/${joinCode}`;

  // Limit visible participants
  const visibleParticipants = useMemo(() => {
    return participants.slice(0, MAX_VISIBLE_PARTICIPANTS);
  }, [participants]);

  // Check if there are more participants than visible
  const hiddenCount = Math.max(0, participants.length - MAX_VISIBLE_PARTICIPANTS);

  return (
    <div className="min-h-screen bg-[var(--neu-bg)] flex flex-col">
      {/* Header with Logo - Responsive padding and sizing */}
      <header className="py-4 px-6 md:py-6 md:px-8 lg:py-8 lg:px-12">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.0, 0.0, 0.2, 1] }}
          className="flex items-center justify-center"
        >
          <div className="flex items-center gap-3 md:gap-4">
            <div className="w-10 h-10 md:w-12 md:h-12 lg:w-16 lg:h-16 rounded-lg md:rounded-xl bg-primary flex items-center justify-center neu-raised">
              <span className="text-white font-bold text-xl md:text-2xl lg:text-3xl font-display">C</span>
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl lg:text-display font-bold text-[var(--text-primary)] font-display">
                CTX Quiz
              </h1>
              <p className="text-sm md:text-base lg:text-body-lg text-[var(--text-secondary)]">
                Live Quiz Platform
              </p>
            </div>
          </div>
        </motion.div>
      </header>

      {/* Main Content - Responsive padding */}
      <main className="flex-1 px-4 pb-4 md:px-8 md:pb-6 lg:px-12 lg:pb-8 flex flex-col">
        {/* Join Section - CSS Grid for responsive layout */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.2, ease: [0.0, 0.0, 0.2, 1] }}
          className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-8 lg:gap-12 mb-6 md:mb-8 lg:mb-12 justify-items-center"
        >
          {/* QR Code Card - Responsive sizing */}
          <div className="neu-raised-lg rounded-xl p-4 md:p-6 lg:p-8 flex flex-col items-center w-full max-w-sm lg:max-w-none">
            <p className="text-lg md:text-xl lg:text-h3 font-medium text-[var(--text-secondary)] mb-3 md:mb-4 lg:mb-6">
              Scan to Join
            </p>
            <div className="neu-pressed rounded-lg p-2 md:p-3 lg:p-4 bg-white">
              {/* QR Code with responsive size */}
              <div className="w-[160px] h-[160px] md:w-[200px] md:h-[200px] lg:w-[240px] lg:h-[240px] xl:w-[280px] xl:h-[280px]">
                <QRCodeSVG
                  value={joinUrl}
                  size={280}
                  level="H"
                  includeMargin={false}
                  bgColor="#FFFFFF"
                  fgColor="#275249"
                  className="w-full h-full"
                />
              </div>
            </div>
            <p className="text-xs md:text-sm lg:text-body text-[var(--text-muted)] mt-2 md:mt-3 lg:mt-4">
              {JOIN_URL_BASE.replace('https://', '')}
            </p>
          </div>

          {/* Join Code Card - Responsive sizing */}
          <div className="neu-raised-lg rounded-xl p-4 md:p-6 lg:p-8 flex flex-col items-center justify-center w-full max-w-sm lg:max-w-none lg:min-w-[350px] xl:min-w-[400px]">
            <p className="text-lg md:text-xl lg:text-h3 font-medium text-[var(--text-secondary)] mb-2 md:mb-3 lg:mb-4">
              Or Enter Code
            </p>
            <div className="neu-pressed rounded-lg px-4 py-3 md:px-6 md:py-4 lg:px-8 lg:py-6 mb-2 md:mb-3 lg:mb-4">
              <motion.span
                key={joinCode}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-3xl md:text-4xl lg:text-5xl xl:text-display-xl font-bold font-mono text-primary tracking-[0.15em] md:tracking-[0.2em] lg:tracking-[0.3em]"
              >
                {joinCode || '------'}
              </motion.span>
            </div>
            <p className="text-sm md:text-base lg:text-body-lg text-[var(--text-secondary)]">
              Visit <span className="font-semibold text-primary">ctx.works/join</span>
            </p>
          </div>
        </motion.div>

        {/* Participants Section - Responsive sizing */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4, ease: [0.0, 0.0, 0.2, 1] }}
          className="flex-1 neu-raised-lg rounded-xl p-4 md:p-6 lg:p-8"
        >
          {/* Participants Header */}
          <div className="flex items-center justify-between mb-4 md:mb-5 lg:mb-6">
            <div className="flex items-center gap-2 md:gap-3 lg:gap-4">
              <h2 className="text-xl md:text-2xl lg:text-h2 font-semibold text-[var(--text-primary)]">
                Participants
              </h2>
              <motion.div
                key={participantCount}
                initial={{ scale: 1.2 }}
                animate={{ scale: 1 }}
                className="neu-raised-sm rounded-full px-3 py-1 md:px-4 md:py-1.5 lg:px-6 lg:py-2"
              >
                <span className="text-lg md:text-xl lg:text-h3 font-bold text-primary font-display">
                  {participantCount}
                </span>
              </motion.div>
            </div>
            
            {/* Connection Status */}
            <div className="flex items-center gap-1.5 md:gap-2">
              <div
                className={`w-2 h-2 md:w-2.5 md:h-2.5 lg:w-3 lg:h-3 rounded-full ${
                  isConnected ? 'bg-success animate-pulse' : 'bg-error'
                }`}
              />
              <span className="text-xs md:text-sm lg:text-body-sm text-[var(--text-muted)]">
                {isConnected ? 'Live' : 'Disconnected'}
              </span>
            </div>
          </div>

          {/* Participants Grid - CSS Grid with responsive columns */}
          <div className="min-h-[120px] md:min-h-[160px] lg:min-h-[200px]">
            {participants.length === 0 ? (
              <div className="flex items-center justify-center h-[120px] md:h-[160px] lg:h-[200px]">
                <p className="text-lg md:text-xl lg:text-h3 text-[var(--text-muted)]">
                  Waiting for participants to join...
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8 gap-2 md:gap-2.5 lg:gap-3">
                <AnimatePresence mode="popLayout">
                  {visibleParticipants.map((participant, index) => (
                    <ParticipantChip
                      key={participant.participantId}
                      nickname={participant.nickname}
                      index={index}
                    />
                  ))}
                  
                  {/* Hidden count indicator */}
                  {hiddenCount > 0 && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="neu-raised-sm rounded-lg px-2 py-1.5 md:px-3 md:py-2 lg:px-4 lg:py-2 flex items-center justify-center"
                    >
                      <span className="text-sm md:text-base lg:text-body-lg font-medium text-[var(--text-muted)]">
                        +{hiddenCount} more
                      </span>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </div>
        </motion.div>

        {/* Waiting Message - Responsive text */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.6 }}
          className="mt-4 md:mt-6 lg:mt-8 text-center"
        >
          <p className="text-xl md:text-2xl lg:text-h2 text-[var(--text-secondary)] font-medium">
            Waiting for host to start...
          </p>
          <motion.div
            animate={{
              opacity: [0.5, 1, 0.5],
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
            className="mt-2 md:mt-3 lg:mt-4 flex justify-center gap-1.5 md:gap-2"
          >
            <span className="w-2 h-2 md:w-2.5 md:h-2.5 lg:w-3 lg:h-3 rounded-full bg-primary" />
            <span className="w-2 h-2 md:w-2.5 md:h-2.5 lg:w-3 lg:h-3 rounded-full bg-primary" />
            <span className="w-2 h-2 md:w-2.5 md:h-2.5 lg:w-3 lg:h-3 rounded-full bg-primary" />
          </motion.div>
        </motion.div>
      </main>

      {/* Footer - Responsive padding */}
      <footer className="py-3 px-4 md:py-4 md:px-8 lg:py-6 lg:px-12 border-t border-[var(--border)]">
        <div className="flex items-center justify-between text-xs md:text-sm lg:text-body text-[var(--text-muted)]">
          <span>
            A product of{' '}
            <a
              href="https://ctx.works"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-primary hover:underline"
            >
              ctx.works
            </a>
          </span>
          <span>
            Powered by{' '}
            <a
              href="https://purplehatevents.in"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--text-secondary)] hover:underline"
            >
              PurpleHat Events
            </a>
          </span>
        </div>
      </footer>
    </div>
  );
}

/**
 * ParticipantChip - Individual participant display chip
 * Responsive sizing for different screen sizes
 */
interface ParticipantChipProps {
  nickname: string;
  index: number;
}

function ParticipantChip({ nickname, index }: ParticipantChipProps) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.5, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.5 }}
      transition={{
        type: 'spring',
        stiffness: 500,
        damping: 30,
        delay: Math.min(index * 0.02, 0.3), // Stagger animation, max 300ms delay
      }}
      className="neu-raised-sm rounded-lg px-2 py-1.5 md:px-3 md:py-2 lg:px-4 lg:py-2"
    >
      <span className="text-sm md:text-base lg:text-body-lg font-medium text-[var(--text-primary)] truncate block">
        {nickname}
      </span>
    </motion.div>
  );
}

export default LobbyScreen;
