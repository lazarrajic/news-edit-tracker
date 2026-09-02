alter table labels drop constraint labels_edit_category_check;

alter table labels add constraint labels_edit_category_check
    check (edit_category in ('trivial', 'stylistic', 'addition', 'deletion', 'factual'));