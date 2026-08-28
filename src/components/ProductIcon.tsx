import React from 'react';
import { Product } from '@/types/store';
import {
  GlassWater,
  Droplets,
  Box,
  Package,
  ShoppingBag,
  Utensils,
  Cookie,
  Sparkles,
  Flame,
  Smartphone,
  Shirt,
  Pill
} from 'lucide-react';

interface ProductIconProps {
  product: Partial<Product>;
  className?: string;
}

export default function ProductIcon({ product, className = "w-6 h-6" }: ProductIconProps) {
  const name = (product.name || '').toLowerCase();
  const category = (product.category || '').toLowerCase();

  // 1. Water, Sachet, Bottled Drinks, Juices
  if (
    name.includes('water') ||
    name.includes('sachet') ||
    name.includes('bottle') ||
    name.includes('drink') ||
    name.includes('coca') ||
    name.includes('pepsi') ||
    name.includes('fanta') ||
    name.includes('sprite') ||
    name.includes('juice') ||
    name.includes('malt') ||
    name.includes('wine') ||
    category.includes('beverage') ||
    category.includes('drink')
  ) {
    if (name.includes('sachet') || name.includes('pure water')) {
      return <Droplets className={`${className} text-sky-400`} />;
    }
    return <GlassWater className={`${className} text-sky-500`} />;
  }

  // 2. Box, Carton, Pack, Cases
  if (
    name.includes('box') ||
    name.includes('carton') ||
    name.includes('crate') ||
    name.includes('pack') ||
    name.includes('case')
  ) {
    return <Box className={`${className} text-amber-500`} />;
  }

  // 3. Snacks, Biscuits, Sweets
  if (
    name.includes('snack') ||
    name.includes('biscuit') ||
    name.includes('sweet') ||
    name.includes('candy') ||
    name.includes('chocolate') ||
    name.includes('chips') ||
    category.includes('snack')
  ) {
    return <Cookie className={`${className} text-amber-400`} />;
  }

  // 4. Food, Rice, Groceries, Oil
  if (
    name.includes('rice') ||
    name.includes('food') ||
    name.includes('indomie') ||
    name.includes('noodle') ||
    name.includes('spaghetti') ||
    name.includes('oil') ||
    name.includes('flour') ||
    name.includes('semo') ||
    name.includes('yam') ||
    name.includes('bread') ||
    category.includes('grocery') ||
    category.includes('food')
  ) {
    return <Utensils className={`${className} text-emerald-500`} />;
  }

  // 5. Soaps, Detergents, Toiletries
  if (
    name.includes('soap') ||
    name.includes('detergent') ||
    name.includes('wash') ||
    name.includes('dettol') ||
    name.includes('tissue') ||
    name.includes('cream') ||
    category.includes('toiletries') ||
    category.includes('cosmetics')
  ) {
    return <Sparkles className={`${className} text-teal-400`} />;
  }

  // 6. Gas, Fuel
  if (
    name.includes('gas') ||
    name.includes('fuel') ||
    name.includes('cylinder') ||
    category.includes('gas')
  ) {
    return <Flame className={`${className} text-orange-500`} />;
  }

  // 7. Electronics
  if (
    name.includes('phone') ||
    name.includes('charger') ||
    name.includes('cable') ||
    name.includes('battery') ||
    category.includes('electronic')
  ) {
    return <Smartphone className={`${className} text-indigo-500`} />;
  }

  // 8. Pharmacy / Medicine
  if (
    name.includes('drug') ||
    name.includes('tab') ||
    name.includes('capsule') ||
    name.includes('syrup') ||
    name.includes('paracetamol') ||
    category.includes('pharmacy')
  ) {
    return <Pill className={`${className} text-rose-500`} />;
  }

  // 9. Clothing
  if (
    category.includes('clothing') ||
    category.includes('boutique') ||
    name.includes('shirt') ||
    name.includes('dress')
  ) {
    return <Shirt className={`${className} text-purple-500`} />;
  }

  // Default Store Package
  return <Package className={`${className} text-primary`} />;
}
