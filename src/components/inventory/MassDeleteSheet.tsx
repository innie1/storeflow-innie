import { clearInventory } from '@/lib/store-data';
import { showToast } from '@/components/Toast';
import Modal from './Modal';
import type { InventoryState } from './useInventory';

/**
 * Deleting many products at once, with the checks that go with it.
 */
export default function MassDeleteSheet({ s }: { s: InventoryState }) {
  const {
    store, onUpdate, setShowMassDeleteModal, massDeleteStep, setMassDeleteStep, quizAnswers,
    setQuizAnswers, quizError, setQuizError, confirmText, setConfirmText,
  } = s;
  return (
    <Modal
      title={massDeleteStep === 1 ? "Security Quiz" : "Delete All Items?"}
      onClose={() => setShowMassDeleteModal(false)}
    >
      {massDeleteStep === 1 ? (
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Answer these security questions correctly to unlock mass deletion:
          </p>

          <div className="space-y-3">
            {/* Question 1 */}
            <div className="space-y-1">
              <p className="text-sm font-semibold">1. How many colors does the Nigerian flag have?</p>
              <div className="flex gap-4">
                {['3', '2', '4'].map(opt => (
                  <label key={opt} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="radio"
                      name="q1"
                      value={opt}
                      checked={quizAnswers.q1 === opt}
                      onChange={e => {
                        setQuizAnswers({ ...quizAnswers, q1: e.target.value });
                        setQuizError('');
                      }}
                      className="text-primary focus:ring-primary h-4 w-4 border-gray-300"
                    />
                    {opt}
                  </label>
                ))}
              </div>
            </div>

            {/* Question 2 */}
            <div className="space-y-1">
              <p className="text-sm font-semibold">2. What color is the sky on a clear day?</p>
              <div className="flex gap-4">
                {['Blue', 'Red', 'Green'].map(opt => (
                  <label key={opt} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="radio"
                      name="q2"
                      value={opt}
                      checked={quizAnswers.q2 === opt}
                      onChange={e => {
                        setQuizAnswers({ ...quizAnswers, q2: e.target.value });
                        setQuizError('');
                      }}
                      className="text-primary focus:ring-primary h-4 w-4 border-gray-300"
                    />
                    {opt}
                  </label>
                ))}
              </div>
            </div>

            {/* Question 3 */}
            <div className="space-y-1">
              <p className="text-sm font-semibold">3. Which of the following is a primary color?</p>
              <div className="flex gap-4">
                {['Red', 'Purple', 'Orange'].map(opt => (
                  <label key={opt} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="radio"
                      name="q3"
                      value={opt}
                      checked={quizAnswers.q3 === opt}
                      onChange={e => {
                        setQuizAnswers({ ...quizAnswers, q3: e.target.value });
                        setQuizError('');
                      }}
                      className="text-primary focus:ring-primary h-4 w-4 border-gray-300"
                    />
                    {opt}
                  </label>
                ))}
              </div>
            </div>
          </div>

          {quizError && (
            <p className="text-xs text-destructive font-semibold">{quizError}</p>
          )}

          <button
            onClick={() => {
              if (quizAnswers.q1 === '2' && quizAnswers.q2 === 'Blue' && quizAnswers.q3 === 'Red') {
                setMassDeleteStep(2);
                setQuizError('');
              } else {
                setQuizError('❌ Incorrect answers. Please try again.');
              }
            }}
            className="w-full p-2.5 rounded-lg bg-primary text-primary-foreground font-display font-semibold hover:opacity-90"
          >
            Next →
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs leading-relaxed">
            ⚠️ **WARNING:** This will delete **ALL {store.products.length} products** from your inventory. This action cannot be easily undone, though items are archived in the trash history.
          </div>

          <div className="space-y-2">
            <p className="text-sm font-semibold">Are you sure you want to delete your inventory?</p>
            <p className="text-xs text-muted-foreground">Type <span className="font-bold text-foreground">YES</span> below to confirm:</p>
            <input
              type="text"
              placeholder="Type YES here"
              value={confirmText}
              onChange={e => setConfirmText(e.target.value)}
              className="w-full p-2.5 rounded-lg bg-surface-2 border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary text-sm font-semibold"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setMassDeleteStep(1)}
              className="p-2.5 rounded-lg bg-secondary text-secondary-foreground font-display font-semibold text-sm hover:bg-surface-3 border border-border"
            >
              ← Back
            </button>
            <button
              onClick={() => {
                if (confirmText === 'YES') {
                  onUpdate(clearInventory(store));
                  setShowMassDeleteModal(false);
                  showToast('All inventory products deleted');
                } else {
                  showToast('Type YES to confirm', 'error');
                }
              }}
              disabled={confirmText !== 'YES'}
              className={`p-2.5 rounded-lg font-display font-semibold text-sm text-white ${
                confirmText === 'YES' ? 'bg-destructive hover:bg-destructive/95' : 'bg-destructive/40 cursor-not-allowed'
              }`}
            >
              Delete Everything
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
