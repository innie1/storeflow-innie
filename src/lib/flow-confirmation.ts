import { FlowPlan } from './flow-brain';

/**
 * All mutating natural-language commands should pass through this layer before
 * an existing action is executed. It creates a human-readable confirmation
 * without performing the action itself.
 */
export interface FlowConfirmation {
  required: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
}

export function getFlowConfirmation(plan: FlowPlan): FlowConfirmation {
  if (!plan.needsConfirmation) {
    return {
      required: false,
      title: '',
      message: '',
      confirmLabel: 'Confirm',
      cancelLabel: 'Cancel',
    };
  }

  const product = plan.productName || 'this product';
  const quantity = plan.quantity || 1;

  switch (plan.intent) {
    case 'sell':
      return {
        required: true,
        title: 'Confirm sale',
        message: `Sell ${quantity} × ${product}? Flow will record this sale and update the existing store records.`,
        confirmLabel: 'Yes, sell',
        cancelLabel: 'Cancel',
      };
    case 'restock':
      return {
        required: true,
        title: 'Confirm restock',
        message: `Add ${quantity} × ${product} to stock?`,
        confirmLabel: 'Yes, restock',
        cancelLabel: 'Cancel',
      };
    case 'discount':
      return {
        required: true,
        title: 'Confirm discount',
        message: `Apply a ${plan.percentage || 10}% discount to ${product}?`,
        confirmLabel: 'Yes, apply',
        cancelLabel: 'Cancel',
      };
    case 'add_product':
      return {
        required: true,
        title: 'Confirm product',
        message: `Add ${product} to your product list?`,
        confirmLabel: 'Yes, add it',
        cancelLabel: 'Cancel',
      };
    case 'edit_product':
      return {
        required: true,
        title: 'Confirm change',
        message: `Change ${product} using the details you provided?`,
        confirmLabel: 'Yes, change it',
        cancelLabel: 'Cancel',
      };
    case 'remove_product':
      return {
        required: true,
        title: 'Confirm removal',
        message: `Remove ${product} from the product list?`,
        confirmLabel: 'Yes, remove',
        cancelLabel: 'Cancel',
      };
    default:
      return {
        required: true,
        title: 'Confirm action',
        message: `Do you want Flow to perform this ${plan.intent.replace(/_/g, ' ')} action?`,
        confirmLabel: 'Yes, continue',
        cancelLabel: 'Cancel',
      };
  }
}
