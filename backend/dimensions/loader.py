"""
Dimension Loader — reads evaluation dimensions from YAML files.
Default dimensions are in default.yaml. Custom dimensions can be loaded from
additional YAML files in the custom/ subdirectory.
"""
import logging
import os
from dataclasses import dataclass, field
from typing import List, Optional

import yaml

logger = logging.getLogger(__name__)

DIMENSIONS_DIR = os.path.dirname(os.path.abspath(__file__))
DEFAULT_YAML = os.path.join(DIMENSIONS_DIR, "default.yaml")
CUSTOM_DIR = os.path.join(DIMENSIONS_DIR, "custom")


@dataclass
class DimensionDef:
    """A single evaluation dimension definition loaded from YAML."""
    id: str
    name: str
    category: str
    description: str
    frameworks: List[str] = field(default_factory=list)
    scoring: dict = field(default_factory=dict)
    what_is_concern: str = ""
    what_is_not_concern: str = ""


def load_dimensions(yaml_path: str = DEFAULT_YAML) -> List[DimensionDef]:
    """Load dimensions from a YAML file."""
    with open(yaml_path, "r") as f:
        data = yaml.safe_load(f)

    dimensions = []
    for category in data.get("categories", []):
        cat_name = category["name"]
        for dim in category.get("dimensions", []):
            dimensions.append(DimensionDef(
                id=dim["id"],
                name=dim["name"],
                category=cat_name,
                description=dim.get("description", ""),
                frameworks=dim.get("frameworks", []),
                scoring=dim.get("scoring", {}),
                what_is_concern=dim.get("what_is_concern", ""),
                what_is_not_concern=dim.get("what_is_not_concern", ""),
            ))

    logger.info(f"Loaded {len(dimensions)} dimensions from {yaml_path}")
    return dimensions


def load_all_dimensions(include_custom: bool = True) -> List[DimensionDef]:
    """Load default dimensions plus any custom YAML files."""
    dimensions = load_dimensions(DEFAULT_YAML)

    if include_custom and os.path.isdir(CUSTOM_DIR):
        for filename in sorted(os.listdir(CUSTOM_DIR)):
            if filename.endswith((".yaml", ".yml")):
                path = os.path.join(CUSTOM_DIR, filename)
                try:
                    custom = load_dimensions(path)
                    dimensions.extend(custom)
                    logger.info(f"Loaded {len(custom)} custom dimensions from {filename}")
                except Exception as e:
                    logger.warning(f"Failed to load custom dimensions from {filename}: {e}")

    return dimensions


def get_dimension_categories(dimensions: List[DimensionDef]) -> dict:
    """Group dimensions by category. Returns {category_name: [DimensionDef, ...]}."""
    categories = {}
    for dim in dimensions:
        if dim.category not in categories:
            categories[dim.category] = []
        categories[dim.category].append(dim)
    return categories
