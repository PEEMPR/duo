import { Gift, ListTodo, MapPin, ShoppingCart, Sparkles } from "lucide-react";

export const KIND_META = {
  todo: { label: "สิ่งที่ต้องทำ", icon: ListTodo },
  shopping: { label: "ของต้องซื้อ", icon: ShoppingCart },
  wishlist: { label: "Wishlist", icon: Gift },
  places: { label: "ที่อยากไป", icon: MapPin },
  other: { label: "อื่น ๆ", icon: Sparkles },
} as const;
