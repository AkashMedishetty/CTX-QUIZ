/**
 * Admin Panel - Quiz List Page
 * 
 * Displays a paginated list of quizzes with:
 * - Search functionality with debounced filtering
 * - Create quiz button
 * - Pagination with page numbers
 * - Neumorphic card styling
 * 
 * Requirements: 1.1
 */

'use client';

import * as React from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Input } from '@/components/ui';
import { get, del, type PaginatedResponse } from '@/lib/api-client';
import { QuizCard, type Quiz } from './components/quiz-card';

/**
 * Items per page for pagination
 */
const ITEMS_PER_PAGE = 9;

/**
 * Simple debounce function for search
 */
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = React.useState<T>(value);

  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(timer);
    };
  }, [value, delay]);

  return debouncedValue;
}

/**
 * Plus icon component
 */
function PlusIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

/**
 * Search icon component
 */
function SearchIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

/**
 * Empty state icon component
 */
function EmptyIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="64"
      height="64"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="12" y1="18" x2="12" y2="12" />
      <line x1="9" y1="15" x2="15" y2="15" />
    </svg>
  );
}

/**
 * Chevron icons for pagination
 */
function ChevronLeftIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

function ChevronRightIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

/**
 * Backend quiz list response structure
 */
interface QuizListResponse {
  success: boolean;
  quizzes: Quiz[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}

/**
 * Fetch quizzes from API and transform to expected format
 */
async function fetchQuizzes(
  page: number,
  limit: number,
  search: string
): Promise<PaginatedResponse<Quiz>> {
  const params = new URLSearchParams({
    page: page.toString(),
    limit: limit.toString(),
  });
  if (search) {
    params.append('search', search);
  }
  const response = await get<QuizListResponse>(`/quizzes?${params.toString()}`);
  
  // Transform backend response to frontend expected format
  return {
    items: response.quizzes || [],
    total: response.pagination?.total || 0,
    page: response.pagination?.page || 1,
    limit: response.pagination?.limit || limit,
    totalPages: response.pagination?.totalPages || 1,
  };
}

/**
 * Delete quiz API call
 */
async function deleteQuiz(quizId: string): Promise<void> {
  await del(`/quizzes/${quizId}`);
}

/**
 * Loading skeleton component
 */
function QuizCardSkeleton() {
  return (
    <div className="neu-raised rounded-lg p-6 animate-pulse">
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="h-6 bg-[var(--shadow-dark)] rounded w-3/4" />
        <div className="h-6 bg-[var(--shadow-dark)] rounded-full w-20" />
      </div>
      <div className="h-4 bg-[var(--shadow-dark)] rounded w-full mb-2" />
      <div className="h-4 bg-[var(--shadow-dark)] rounded w-2/3 mb-4" />
      <div className="flex items-center gap-4 mb-5">
        <div className="h-4 bg-[var(--shadow-dark)] rounded w-24" />
        <div className="h-4 bg-[var(--shadow-dark)] rounded w-24" />
      </div>
      <div className="flex items-center gap-3">
        <div className="h-9 bg-[var(--shadow-dark)] rounded flex-1" />
        <div className="h-9 w-9 bg-[var(--shadow-dark)] rounded" />
      </div>
    </div>
  );
}

/**
 * Pagination component
 */
function Pagination({
  currentPage,
  totalPages,
  onPageChange,
}: {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;

  // Generate page numbers to display
  const getPageNumbers = () => {
    const pages: (number | 'ellipsis')[] = [];
    const maxVisible = 5;

    if (totalPages <= maxVisible) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }

    // Always show first page
    pages.push(1);

    if (currentPage > 3) {
      pages.push('ellipsis');
    }

    // Show pages around current
    const start = Math.max(2, currentPage - 1);
    const end = Math.min(totalPages - 1, currentPage + 1);

    for (let i = start; i <= end; i++) {
      pages.push(i);
    }

    if (currentPage < totalPages - 2) {
      pages.push('ellipsis');
    }

    // Always show last page
    if (totalPages > 1) {
      pages.push(totalPages);
    }

    return pages;
  };

  return (
    <nav
      className="flex items-center justify-center gap-2 mt-8"
      aria-label="Pagination"
    >
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage === 1}
        aria-label="Previous page"
      >
        <ChevronLeftIcon />
      </Button>

      <div className="flex items-center gap-1">
        {getPageNumbers().map((page, index) =>
          page === 'ellipsis' ? (
            <span
              key={`ellipsis-${index}`}
              className="px-2 text-[var(--text-muted)]"
            >
              ...
            </span>
          ) : (
            <Button
              key={page}
              variant={currentPage === page ? 'primary' : 'ghost'}
              size="icon-sm"
              onClick={() => onPageChange(page)}
              aria-label={`Page ${page}`}
              aria-current={currentPage === page ? 'page' : undefined}
            >
              {page}
            </Button>
          )
        )}
      </div>

      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage === totalPages}
        aria-label="Next page"
      >
        <ChevronRightIcon />
      </Button>
    </nav>
  );
}

/**
 * Empty state component
 */
function EmptyState({ hasSearch }: { hasSearch: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center justify-center py-16 px-4"
    >
      <div className="neu-pressed rounded-full p-6 mb-6">
        <EmptyIcon className="text-[var(--text-muted)]" />
      </div>
      <h3 className="text-h3 font-semibold text-[var(--text-primary)] mb-2">
        {hasSearch ? 'No quizzes found' : 'No quizzes yet'}
      </h3>
      <p className="text-body text-[var(--text-secondary)] text-center max-w-md mb-6">
        {hasSearch
          ? 'Try adjusting your search terms or clear the search to see all quizzes.'
          : 'Create your first quiz to get started with CTX Quiz.'}
      </p>
      {!hasSearch && (
        <Link href="/admin/quiz/new">
          <Button variant="primary" leftIcon={<PlusIcon />}>
            Create Your First Quiz
          </Button>
        </Link>
      )}
    </motion.div>
  );
}

/**
 * Error state component
 */
function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center justify-center py-16 px-4"
    >
      <div className="neu-pressed rounded-full p-6 mb-6">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="64"
          height="64"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-error"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </div>
      <h3 className="text-h3 font-semibold text-[var(--text-primary)] mb-2">
        Failed to load quizzes
      </h3>
      <p className="text-body text-[var(--text-secondary)] text-center max-w-md mb-6">
        There was an error loading your quizzes. Please try again.
      </p>
      <Button variant="primary" onClick={onRetry}>
        Try Again
      </Button>
    </motion.div>
  );
}

/**
 * Admin Quiz List Page
 */
export default function AdminQuizListPage() {
  const queryClient = useQueryClient();
  const [currentPage, setCurrentPage] = React.useState(1);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [deletingId, setDeletingId] = React.useState<string | null>(null);

  // Debounced search value
  const debouncedSearch = useDebounce(searchQuery, 300);

  // Reset to first page when search changes
  React.useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch]);

  // Handle search input change
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  };

  // Fetch quizzes query
  const {
    data,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['quizzes', currentPage, ITEMS_PER_PAGE, debouncedSearch],
    queryFn: () => fetchQuizzes(currentPage, ITEMS_PER_PAGE, debouncedSearch),
    staleTime: 30000, // 30 seconds
  });

  // Delete quiz mutation
  const deleteMutation = useMutation({
    mutationFn: deleteQuiz,
    onMutate: (quizId) => {
      setDeletingId(quizId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quizzes'] });
    },
    onSettled: () => {
      setDeletingId(null);
    },
  });

  // Handle delete
  const handleDelete = (quizId: string) => {
    if (window.confirm('Are you sure you want to delete this quiz?')) {
      deleteMutation.mutate(quizId);
    }
  };

  // Handle page change
  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div>
      {/* Page Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="mb-8"
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-h1 font-semibold text-[var(--text-primary)]">
              Quizzes
            </h1>
            <p className="text-body text-[var(--text-secondary)] mt-1">
              Create and manage your quiz library
            </p>
          </div>
          <Link href="/admin/quiz/new">
            <Button variant="primary" leftIcon={<PlusIcon />}>
              Create Quiz
            </Button>
          </Link>
        </div>

        {/* Search Bar */}
        <div className="max-w-md">
          <Input
            placeholder="Search quizzes..."
            value={searchQuery}
            onChange={handleSearchChange}
            leftIcon={<SearchIcon className="text-[var(--text-muted)]" />}
            size="md"
          />
        </div>
      </motion.div>

      {/* Content */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <QuizCardSkeleton key={i} />
          ))}
        </div>
      ) : isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : !data?.items?.length ? (
        <EmptyState hasSearch={!!debouncedSearch} />
      ) : (
        <>
          {/* Results count */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-body-sm text-[var(--text-muted)] mb-4"
          >
            Showing {data.items.length} of {data.total}{' '}
            {data.total === 1 ? 'quiz' : 'quizzes'}
            {debouncedSearch && ` for "${debouncedSearch}"`}
          </motion.p>

          {/* Quiz Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <AnimatePresence mode="popLayout">
              {data.items.map((quiz) => (
                <QuizCard
                  key={quiz._id}
                  quiz={quiz}
                  onDelete={handleDelete}
                  isDeleting={deletingId === quiz._id}
                />
              ))}
            </AnimatePresence>
          </div>

          {/* Pagination */}
          <Pagination
            currentPage={data.page}
            totalPages={data.totalPages}
            onPageChange={handlePageChange}
          />
        </>
      )}
    </div>
  );
}
