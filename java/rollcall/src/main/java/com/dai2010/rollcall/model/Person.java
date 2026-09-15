package com.dai2010.rollcall.model;

import java.util.Objects;

/** A numbered person in a name list. */
public final class Person {
    private int id;
    private String name;

    public Person() {
        // Required by Gson.
    }

    public Person(int id, String name) {
        this.id = id;
        this.name = name == null ? "" : name.trim();
    }

    public int getId() {
        return id;
    }

    public void setId(int id) {
        this.id = id;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name == null ? "" : name.trim();
    }

    @Override
    public boolean equals(Object other) {
        if (this == other) {
            return true;
        }
        if (!(other instanceof Person person)) {
            return false;
        }
        return id == person.id && Objects.equals(name, person.name);
    }

    @Override
    public int hashCode() {
        return Objects.hash(id, name);
    }

    @Override
    public String toString() {
        return id + " - " + name;
    }
}
