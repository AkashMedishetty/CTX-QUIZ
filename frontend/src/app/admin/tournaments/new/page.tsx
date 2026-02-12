/**
 * Create Tournament Page
 * 
 * Form for creating a new multi-round tournament with:
 * - Tournament title and description
 * - Round configuration with quiz selection
 * - Progression rules (TOP_N or TOP_PERCENTAGE)
 * - Score carry-over option
 * 
 * Requirements: 3.1, 3.2, 3.3, 3.4
 */

'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Button, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui';
import { get, post } from '@/lib/api-client';

/**
 * Quiz data for selection
 */
interface Quiz {
  _id: string;
  title: string;
  questions: { questionId: string }[];
}

/**
 * Round configuration
 */
interface RoundConfig {
  quizId: string;
  quizTitle: string;
}

/**
 * Progression type
 */
type ProgressionType = 'TOP_N' | 'TOP_PERCENTAGE';

/**
 * Form data
 */
interface TournamentFormData {
  title: string;
  description: string;
  progressionType: ProgressionType;
  progressionValue: number;
  scoreCarryOver: boolean;
  rounds: RoundConfig[];
}

/**
 * Icon components
 */
function ArrowLeftIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <line x1="19" y1="12" x2="5" y2="12" />
      <polyline points="12 19 5 12 12 5" />
    </svg>
  );
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

function InfoIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  );
}


/**
 * Fetch quizzes for selection
 */
async function fetchQuizzes(): Promise<Quiz[]> {
  try {
    const response = await get<{ success: boolean; quizzes: Quiz[] }>('/quizzes');
    return response.quizzes || [];
  } catch {
    return [];
  }
}

/**
 * Create tournament API call
 */
async function createTournament(data: {
  title: string;
  description?: string;
  progressionRules: {
    type: ProgressionType;
    value: number;
    scoreCarryOver: boolean;
  };
  roundQuizIds: string[];
}): Promise<{ tournamentId: string }> {
  return post('/tournaments', data);
}

/**
 * Create Tournament Page
 */
export default function CreateTournamentPage() {
  const router = useRouter();
  
  const [formData, setFormData] = React.useState<TournamentFormData>({
    title: '',
    description: '',
    progressionType: 'TOP_N',
    progressionValue: 10,
    scoreCarryOver: false,
    rounds: [],
  });
  
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  // Fetch quizzes
  const { data: quizzes, isLoading: isLoadingQuizzes } = useQuery({
    queryKey: ['quizzes'],
    queryFn: fetchQuizzes,
  });

  // Create mutation
  const createMutation = useMutation({
    mutationFn: createTournament,
    onSuccess: (data) => {
      router.push(`/admin/tournaments/${data.tournamentId}`);
    },
    onError: (error: Error) => {
      setErrors({ submit: error.message });
    },
  });

  const handleAddRound = () => {
    if (!quizzes?.length) return;
    
    setFormData(prev => ({
      ...prev,
      rounds: [
        ...prev.rounds,
        { quizId: '', quizTitle: '' },
      ],
    }));
  };

  const handleRemoveRound = (index: number) => {
    setFormData(prev => ({
      ...prev,
      rounds: prev.rounds.filter((_, i) => i !== index),
    }));
  };

  const handleRoundQuizChange = (index: number, quizId: string) => {
    const quiz = quizzes?.find(q => q._id === quizId);
    setFormData(prev => ({
      ...prev,
      rounds: prev.rounds.map((round, i) =>
        i === index ? { quizId, quizTitle: quiz?.title || '' } : round
      ),
    }));
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};
    
    if (!formData.title.trim()) {
      newErrors.title = 'Tournament title is required';
    }
    
    if (formData.rounds.length === 0) {
      newErrors.rounds = 'At least one round is required';
    }
    
    if (formData.rounds.some(r => !r.quizId)) {
      newErrors.rounds = 'All rounds must have a quiz selected';
    }
    
    if (formData.progressionValue <= 0) {
      newErrors.progressionValue = 'Progression value must be greater than 0';
    }
    
    if (formData.progressionType === 'TOP_PERCENTAGE' && formData.progressionValue > 100) {
      newErrors.progressionValue = 'Percentage cannot exceed 100';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) return;
    
    createMutation.mutate({
      title: formData.title.trim(),
      description: formData.description.trim() || undefined,
      progressionRules: {
        type: formData.progressionType,
        value: formData.progressionValue,
        scoreCarryOver: formData.scoreCarryOver,
      },
      roundQuizIds: formData.rounds.map(r => r.quizId),
    });
  };

  return (
    <div>
      {/* Page Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-body-sm text-[var(--text-secondary)] hover:text-primary mb-4 transition-colors"
        >
          <ArrowLeftIcon />
          Back to Tournaments
        </button>
        <h1 className="text-h1 font-semibold text-[var(--text-primary)]">
          Create Tournament
        </h1>
        <p className="text-body text-[var(--text-secondary)] mt-1">
          Set up a multi-round tournament with elimination
        </p>
      </motion.div>

      {/* Form */}
      <motion.form
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        onSubmit={handleSubmit}
        className="space-y-8 max-w-2xl"
      >
        {/* Basic Info */}
        <div className="neu-raised rounded-lg p-6 space-y-4">
          <h2 className="text-h3 font-semibold text-[var(--text-primary)]">
            Basic Information
          </h2>
          
          <Input
            label="Tournament Title"
            placeholder="e.g., Championship Quiz 2024"
            value={formData.title}
            onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
            error={errors.title}
            required
          />
          
          <div>
            <label className="block text-body-sm font-medium text-[var(--text-primary)] mb-2">
              Description (optional)
            </label>
            <textarea
              className="w-full px-4 py-3 rounded-lg neu-pressed bg-transparent text-body text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
              rows={3}
              placeholder="Describe your tournament..."
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
            />
          </div>
        </div>

        {/* Progression Rules */}
        <div className="neu-raised rounded-lg p-6 space-y-4">
          <div className="flex items-center gap-2">
            <h2 className="text-h3 font-semibold text-[var(--text-primary)]">
              Progression Rules
            </h2>
            <div className="group relative">
              <InfoIcon className="text-[var(--text-muted)] cursor-help" />
              <div className="absolute left-0 bottom-full mb-2 w-64 p-3 bg-[var(--neu-surface)] rounded-lg shadow-lg text-body-sm text-[var(--text-secondary)] opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
                Determines how many participants advance to the next round after each round ends.
              </div>
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-body-sm font-medium text-[var(--text-primary)] mb-2">
                Progression Type
              </label>
              <Select
                value={formData.progressionType}
                onValueChange={(v) => setFormData(prev => ({ ...prev, progressionType: v as ProgressionType }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="TOP_N">Top N Participants</SelectItem>
                  <SelectItem value="TOP_PERCENTAGE">Top Percentage</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <Input
              label={formData.progressionType === 'TOP_N' ? 'Number of Participants' : 'Percentage (%)'}
              type="number"
              min={1}
              max={formData.progressionType === 'TOP_PERCENTAGE' ? 100 : undefined}
              value={formData.progressionValue}
              onChange={(e) => setFormData(prev => ({ ...prev, progressionValue: parseInt(e.target.value) || 0 }))}
              error={errors.progressionValue}
            />
          </div>
          
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={formData.scoreCarryOver}
              onChange={(e) => setFormData(prev => ({ ...prev, scoreCarryOver: e.target.checked }))}
              className="w-5 h-5 rounded border-2 border-[var(--border)] text-primary focus:ring-primary"
            />
            <span className="text-body text-[var(--text-primary)]">
              Carry over scores between rounds
            </span>
          </label>
        </div>

        {/* Rounds */}
        <div className="neu-raised rounded-lg p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-h3 font-semibold text-[var(--text-primary)]">
              Rounds ({formData.rounds.length})
            </h2>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleAddRound}
              disabled={isLoadingQuizzes || !quizzes?.length}
              leftIcon={<PlusIcon />}
            >
              Add Round
            </Button>
          </div>
          
          {errors.rounds && (
            <p className="text-body-sm text-error">{errors.rounds}</p>
          )}
          
          {formData.rounds.length === 0 ? (
            <div className="neu-pressed rounded-lg p-8 text-center">
              <p className="text-body text-[var(--text-muted)]">
                No rounds added yet. Click "Add Round" to configure your tournament rounds.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {formData.rounds.map((round, index) => (
                <div
                  key={index}
                  className="flex items-center gap-4 p-4 neu-pressed rounded-lg"
                >
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-body font-semibold text-primary">
                      {index + 1}
                    </span>
                  </div>
                  
                  <div className="flex-1">
                    <Select
                      value={round.quizId}
                      onValueChange={(v) => handleRoundQuizChange(index, v)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select a quiz..." />
                      </SelectTrigger>
                      <SelectContent>
                        {quizzes?.map((quiz) => (
                          <SelectItem key={quiz._id} value={quiz._id}>
                            {quiz.title} ({quiz.questions.length} questions)
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => handleRemoveRound(index)}
                    className="text-error hover:bg-error/10"
                  >
                    <TrashIcon />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Submit */}
        {errors.submit && (
          <p className="text-body-sm text-error">{errors.submit}</p>
        )}
        
        <div className="flex items-center gap-4">
          <Button
            type="submit"
            variant="primary"
            disabled={createMutation.isPending}
            isLoading={createMutation.isPending}
          >
            Create Tournament
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => router.back()}
          >
            Cancel
          </Button>
        </div>
      </motion.form>
    </div>
  );
}
