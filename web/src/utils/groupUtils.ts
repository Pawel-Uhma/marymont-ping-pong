/**
 * Converts a numeric group ID to an alphabetic letter.
 * 1 -> A, 2 -> B, 3 -> C, ..., 26 -> Z
 * For numbers > 26, continues with AA, AB, etc.
 * 
 * @param groupId - The group ID (can be string or number)
 * @returns The alphabetic representation (e.g., "A", "B", "C")
 */
export function getGroupLetter(groupId: string | number): string {
  // Convert to number if it's a string
  let num: number;
  if (typeof groupId === 'string') {
    // Handle cases like "1", "group_1", etc.
    const numericPart = groupId.replace(/[^0-9]/g, '');
    if (!numericPart) {
      // If no numeric part found, return as-is (e.g., "nogroup")
      return groupId;
    }
    num = parseInt(numericPart, 10);
  } else {
    num = groupId;
  }

  // Handle invalid numbers
  if (isNaN(num) || num <= 0) {
    return String(groupId);
  }

  // Convert to letter (1 -> A, 2 -> B, etc.)
  // A is char code 65, so we subtract 1 from num to get the right letter
  if (num <= 26) {
    return String.fromCharCode(64 + num); // 1 -> 65 (A), 2 -> 66 (B), etc.
  }

  // For numbers > 26, use double letters (AA, AB, etc.)
  const firstLetter = Math.floor((num - 1) / 26);
  const secondLetter = ((num - 1) % 26) + 1;
  return String.fromCharCode(64 + firstLetter) + String.fromCharCode(64 + secondLetter);
}

