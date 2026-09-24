// Reduced extraction fixtures. Nutrient amounts/IDs/descriptions are from the pinned Foundation release;
// row IDs and serving/inputFoods metadata are synthetic adversarial data, not additional USDA claims.
export const nutrient = (id, amount, unitName = 'g') => ({ id: id + 9000000, nutrient: { id, unitName }, amount });
export const rice = () => ({
  fdcId: 2512381, description: 'Rice, white, long grain, unenriched, raw',
  foodCategory: { description: 'Cereal Grains and Pasta' },
  foodNutrients: [nutrient(1003, 7.04), nutrient(1004, 1.03), nutrient(1005, 80.3),
    nutrient(2048, 370, 'kcal'), nutrient(1051, 11.2)],
});
export const chicken = () => ({
  fdcId: 2646170, description: 'Chicken, breast, boneless, skinless, raw',
  foodCategory: { description: 'Poultry Products' },
  foodNutrients: [nutrient(1003, 22.5), nutrient(1004, 1.93), nutrient(1005, 0),
    nutrient(2048, 112, 'kcal'), nutrient(1051, 74.8)],
});
export const legacyCsv = {
  'food.csv': 'description,fdc_id,data_type,food_category_id\r\n"Test rice, cooked",42,sr_legacy_food,20\r\n',
  'food_category.csv': 'description,id\nCereal Grains and Pasta,20\n',
  'nutrient.csv': 'unit_name,id\nG,1003\nG,1004\nG,1005\nKCAL,1008\n',
  'food_nutrient.csv': 'amount,nutrient_id,fdc_id,id\n2.5,1003,42,99\n0.5,1004,42,100\n28,1005,42,101\n130,1008,42,102\n999,1008,999,103\n',
};
